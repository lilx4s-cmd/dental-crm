jest.mock('../pdf/pdf.service', () => ({ PdfService: class {} }));
import { Test } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CaseAccessGuard } from './guards/case-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TreatmentPlansController } from '../treatment-plans/treatment-plans.controller';
import { TreatmentPlansService } from '../treatment-plans/treatment-plans.service';
import { LabOrdersController } from '../lab-orders/lab-orders.controller';
import { LabOrdersService } from '../lab-orders/lab-orders.service';
import { SettingsService } from '../settings/settings.service';
import { PdfService } from '../pdf/pdf.service';
import { CRM_CORS_METHODS } from './http-policy';

describe('Signed HTTP request → permissions → case → data', () => {
  let app: INestApplication, token: string, prisma: any, readonly: boolean, savedStay: any;
  beforeAll(async () => {
    const config = new ConfigService({
      jwt: { accessSecret: 'fixture-http-access-secret-not-real' },
    });
    prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'sales',
          email: 'sales@example.test',
          role: 'SALES_CONSULTANT',
          isActive: true,
          accessProfile: {
            name: 'Fixture',
            permissions: {
              'plans.read': true,
              'plans.write': !readonly,
              'leads.all': false,
              'patients.read': false,
              'quotes.approve_discount': false,
            },
          },
        })),
      },
      refreshToken: { findFirst: jest.fn().mockResolvedValue({ id: 'fixture-session' }) },
      patient: {
        findFirst: jest.fn(async ({ where }) => (where.id === 'own' ? { id: 'own' } : null)),
        findUnique: jest.fn().mockResolvedValue({ diagnosis: null }),
      },
      treatmentPlan: {
        findUnique: jest.fn(async ({ where }) => ({
          id: where.id,
          patientId: where.id === 'own-plan' ? 'own' : 'other',
          title: 'Fictional plan',
          cardFeePercent: 0,
          cashDiscountPercent: 0,
          stay: savedStay,
        })),
        findMany: jest.fn().mockResolvedValue([{ id: 'own-plan' }]),
        create: jest.fn().mockResolvedValue({ id: 'new-plan' }),
        update: jest.fn(),
      },
      treatmentPlanStay: {
        upsert: jest.fn(async ({ create }) => {
          savedStay = create;
          return create;
        }),
        deleteMany: jest.fn(),
      },
      treatmentPlanScheduleItem: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (operations) => Promise.all(operations)),
      labOrder: {
        findUnique: jest.fn().mockResolvedValue({ treatmentPlan: { patientId: 'other' } }),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      clinicSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            defaultCardFeePercent: 0,
            defaultCashDiscountPercent: 0,
            documentConfiguration: {
              priceList: [{ type: 'implant', currency: 'USD', unitPrice: 1000 }],
            },
          }),
      },
      costCatalogVersion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [TreatmentPlansController, LabOrdersController],
      providers: [
        Reflector,
        JwtStrategy,
        CaseAccessGuard,
        TreatmentPlansService,
        LabOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: ConfigService, useValue: config },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.enableCors({
      origin: ['https://dental-crm-web-psi.vercel.app'],
      credentials: true,
      methods: CRM_CORS_METHODS,
    });
    await app.init();
    token = await new JwtService().signAsync(
      { sub: 'sales', email: 'sales@example.test', role: 'SUPER_ADMIN', sid: 'fixture-session' },
      { secret: config.get('jwt.accessSecret'), expiresIn: '15m' },
    );
  });
  beforeEach(() => {
    readonly = false;
    savedStay = null;
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
  });
  const auth = () => ({ Authorization: `Bearer ${token}` });
  it('blocks requests with no authenticated session', async () => {
    await request(app.getHttpServer()).get('/api/treatment-plans/own-plan').expect(401);
  });
  it('uses current database privileges, not a stale owner claim, and refuses another case', async () => {
    await request(app.getHttpServer())
      .get('/api/treatment-plans/their-plan')
      .set(auth())
      .expect(404);
    await request(app.getHttpServer())
      .patch('/api/treatment-plans/their-plan')
      .set(auth())
      .send({ title: 'Changed' })
      .expect(404);
    expect(prisma.treatmentPlan.update).not.toHaveBeenCalled();
  });
  it('rejects an omitted list filter but keeps an owned case readable', async () => {
    await request(app.getHttpServer()).get('/api/treatment-plans').set(auth()).expect(400);
    await request(app.getHttpServer())
      .get('/api/treatment-plans?patientId=own')
      .set(auth())
      .expect(200);
    await request(app.getHttpServer()).get('/api/treatment-plans/own-plan').set(auth()).expect(200);
  });
  it('denies a read-only lab write before reaching its data operation', async () => {
    readonly = true;
    await request(app.getHttpServer())
      .post('/api/treatment-plans/own-plan/lab-orders')
      .set(auth())
      .send({ labName: 'Fixture lab' })
      .expect(403);
    expect(prisma.labOrder.create).not.toHaveBeenCalled();
  });
  it('rejects client price tampering and persists a correct approved price', async () => {
    const body = {
      patientId: 'own',
      title: 'Fictional plan',
      currency: 'USD',
      items: [
        {
          procedureType: 'implant',
          description: 'Test implant',
          quantity: 2,
          unitPrice: 1000,
          cost: 1,
          discount: 0,
        },
      ],
    };
    await request(app.getHttpServer())
      .post('/api/treatment-plans')
      .set(auth())
      .send(body)
      .expect(400);
    expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
    body.items[0].cost = 2000;
    await request(app.getHttpServer())
      .post('/api/treatment-plans')
      .set(auth())
      .send(body)
      .expect(201);
    expect(prisma.treatmentPlan.create.mock.calls[0][0].data.totalCost).toBe(2000);
  });
  it('denies an unapproved payment-term change', async () => {
    await request(app.getHttpServer())
      .patch('/api/treatment-plans/own-plan')
      .set(auth())
      .send({ cashDiscountPercent: 10 })
      .expect(403);
    expect(prisma.treatmentPlan.update).not.toHaveBeenCalled();
  });
  it('allows the editor’s PUT preflight from the actual CRM origin', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/treatment-plans/own-plan/itinerary')
      .set('Origin', 'https://dental-crm-web-psi.vercel.app')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);
    expect(response.headers['access-control-allow-methods'].split(',')).toContain('PUT');
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://dental-crm-web-psi.vercel.app',
    );
  });
  it('saves an owned itinerary through PUT and returns the updated data', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/treatment-plans/own-plan/itinerary')
      .set(auth())
      .set('Origin', 'https://dental-crm-web-psi.vercel.app')
      .send({
        stay: { hotelName: 'Fictional hotel', arrivalDate: '2026-11-01' },
        scheduleItems: [],
      })
      .expect(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.treatmentPlanStay.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { treatmentPlanId: 'own-plan' } }),
    );
    expect(response.body.stay.hotelName).toBe('Fictional hotel');
  });
});
