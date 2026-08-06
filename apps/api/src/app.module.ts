import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TagsModule } from './tags/tags.module';
import { RemindersModule } from './reminders/reminders.module';
import { MessageTemplatesModule } from './message-templates/message-templates.module';
import { PatientsModule } from './patients/patients.module';
import { LeadsModule } from './leads/leads.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ConversationsModule } from './conversations/conversations.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { FacebookModule } from './facebook/facebook.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { TreatmentPlansModule } from './treatment-plans/treatment-plans.module';
import { WarrantiesModule } from './warranties/warranties.module';
import { LabOrdersModule } from './lab-orders/lab-orders.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { FilesModule } from './files/files.module';
import { PdfModule } from './pdf/pdf.module';
import { PortalModule } from './portal/portal.module';
import { IntakeModule } from './intake/intake.module';
import { AiModule } from './ai/ai.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { MailModule } from './mail/mail.module';
import { SearchModule } from './search/search.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    // Registered once for the whole app. Per-module registration starts a second scheduler.
    ScheduleModule.forRoot(),
    TagsModule,
    RemindersModule,
    MessageTemplatesModule,
    PatientsModule,
    LeadsModule,
    DashboardModule,
    CampaignsModule,
    ConversationsModule,
    WhatsAppModule,
    FacebookModule,
    AppointmentsModule,
    TreatmentPlansModule,
    WarrantiesModule,
    LabOrdersModule,
    InvoicesModule,
    ReportsModule,
    SettingsModule,
    FilesModule,
    PdfModule,
    PortalModule,
    IntakeModule,
    AiModule,
    MailModule,
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Runs before the logger so the header is set even on a route that streams its own response.
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Last, so it sees the outcome of everything in front of it — including a request the roles
    // guard refused, which is exactly the kind an audit trail is kept for.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
