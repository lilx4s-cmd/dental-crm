import { execFileSync } from 'child_process';
import { join } from 'path';

it('migrates existing patients and handles monthly visits, reminder deduplication, changes and ownership against PostgreSQL', () => {
  const script = `
    require('reflect-metadata');
    const assert = require('assert/strict');
    const fs = require('fs'), os = require('os'), path = require('path');
    const { execFileSync } = require('child_process');
    const { PGlite } = require('@electric-sql/pglite');
    const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
    const { PrismaClient } = require('@prisma/client');
    const Module = require('module'), originalLoad = Module._load;
    Module._load = function(id, ...args) {
      if (id.endsWith('/whatsapp-sender.service')) return { WhatsAppSenderService: class {} };
      if (id.endsWith('/whatsapp-web.service')) return { WhatsAppWebService: class {} };
      return originalLoad.call(this, id, ...args);
    };
    const { PatientsService } = require('./src/patients/patients.service');
    const { PatientScheduleService } = require('./src/patient-schedule/patient-schedule.service');
    const { StaffAlertsService } = require('./src/staff-alerts/staff-alerts.service');
    (async () => {
      const db = await PGlite.create(), server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'patient-schedule-'));
      let prisma;
      try {
        // Reconstruct the schema immediately before this migration so defaults and CHECKs are
        // tested on existing rows, not just Prisma's generated ideal schema.
        const schema = fs.readFileSync('prisma/schema.prisma', 'utf8').replace(/^\\s*treatmentStatus\\s+String\\s+@default\\("WORKING"\\)\\s*$/m, '').replace(/^\\s*treatmentFinishedAt\\s+DateTime\\?\\s*$/m, '').replace(/^\\s*@@index\\(\\[isActive, treatmentStatus\\]\\)\\s*$/m, '').replace(/^\\s*schedule\\s+Json\\?\\s*$/m, '');
        const schemaPath = path.join(tmp, 'schema.prisma'); fs.writeFileSync(schemaPath, schema);
        const sql = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaPath, '--script'], { encoding: 'utf8' });
        await db.exec(sql);
        await db.query('INSERT INTO patients (id,"firstName","lastName","updatedAt") VALUES ($1,$2,$3,NOW())', ['legacy', 'Existing', 'Patient']);
        await db.exec(fs.readFileSync('prisma/migrations/20261009142000_patient_schedule/migration.sql', 'utf8'));
        await assert.rejects(db.query('UPDATE patients SET "treatmentStatus" = $1 WHERE id = $2', ['INVALID', 'legacy']));
        await server.start();
        prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@' + server.getServerConn() + '/postgres?connection_limit=1&sslmode=disable' } } });
        assert.equal((await prisma.patient.findUnique({ where: { id: 'legacy' } })).treatmentStatus, 'WORKING');
        const owner = await prisma.user.create({ data: { email: 'fictional-owner@example.org', passwordHash: 'unused', firstName: 'Owner', lastName: 'Staff', role: 'SALES_CONSULTANT' } });
        const other = await prisma.user.create({ data: { email: 'fictional-other@example.org', passwordHash: 'unused', firstName: 'Other', lastName: 'Staff', role: 'SALES_CONSULTANT' } });
        const manager = await prisma.user.create({ data: { email: 'fictional-manager@example.org', passwordHash: 'unused', firstName: 'Manager', lastName: 'Staff', role: 'CLINIC_MANAGER' } });
        const lead = await prisma.lead.create({ data: { firstName: 'Fictional', lastName: 'Visit', source: 'OTHER', assignedToId: owner.id } });
        const patient = await prisma.patient.create({ data: { firstName: 'Fictional', lastName: 'Visit', convertedFromLeadId: lead.id } });
        const now = new Date('2098-12-31T19:00:00Z');
        const booking = await prisma.travelBooking.create({ data: { patientId: patient.id, leadId: lead.id, visit: 1, status: 'CONFIRMED', createdById: owner.id, arrivalAt: new Date('2098-12-31T21:30:00Z'), departureAt: new Date('2099-02-01T08:00:00Z'), details: {} } });
        await prisma.travelBooking.create({ data: { patientId: patient.id, leadId: lead.id, visit: 2, status: 'CONFIRMED', createdById: owner.id, arrivalAt: new Date('2099-01-15T10:00:00Z'), details: {} } });
        const appt = await prisma.appointment.create({ data: { patientId: patient.id, createdById: manager.id, startTime: new Date('2099-01-08T10:00:00Z'), endTime: new Date('2099-01-08T11:00:00Z') } });
        const patients = new PatientsService(prisma);
        const summary = await patients.summary({ page: 1, limit: 20 }, now);
        assert.deepEqual(summary.months, [{ month: '2099-01', count: 1 }, { month: '2099-02', count: 1 }]);
        assert.equal(summary.reservations, 1);
        assert.equal((await patients.findAll({ page: 1, limit: 20, search: 'Fictional Visit' })).meta.total, 1);
        assert.equal((await patients.findAll({ page: 1, limit: 20, view: 'reservations', month: '2099-02' })).meta.total, 1);
        assert.equal((await patients.findAll({ page: 1, limit: 20, month: '2098-12' })).meta.total, 0);
        assert.equal((await patients.findAll({ page: 1, limit: 20, staffId: other.id })).meta.total, 0);
        await patients.treatmentStatus(patient.id, 'FINISHED');
        const finished = await patients.treatmentStatus(patient.id, 'FINISHED');
        assert(finished.treatmentFinishedAt);
        assert.equal((await patients.findAll({ page: 1, limit: 20, view: 'finished' })).meta.total, 1);
        assert.equal((await patients.findAll({ page: 1, limit: 20, view: 'reservations', month: '2099-02' })).meta.total, 1);
        await patients.treatmentStatus(patient.id, 'WORKING');
        assert.equal((await patients.findOne(patient.id)).treatmentFinishedAt, null);
        await prisma.clinicSettings.create({ data: { clinicName: 'Fictional clinic', notificationSettings: { enabled: false } } });
        const sender = { sendText: () => { throw Error('Never send patient reminder WhatsApp'); } };
        const alerts = new StaffAlertsService(prisma, sender, {}, { get: key => key === 'cors.origin' ? ['https://crm.example'] : undefined });
        const reminders = new PatientScheduleService(prisma, alerts, {});
        await reminders.run(now);
        assert.equal(await prisma.staffAlert.count({ where: { kind: 'PATIENT_DATE' } }), 2);
        await new PatientScheduleService(prisma, alerts, {}).run(now);
        assert.equal(await prisma.staffAlert.count(), 2, 'Restart must not create duplicate reminders');
        await alerts.run(now);
        const inbox = await alerts.notifications(owner.id);
        assert.equal(inbox.unread, 1, 'In-app reminders work outside working hours and with lead alerts disabled');
        assert.equal(inbox.data[0].path, '/travel?bookingId=' + booking.id);
        assert.equal((await alerts.notifications(other.id)).data.length, 0);
        await assert.rejects(alerts.readNotification(other.id, inbox.data[0].id));
        await alerts.readNotification(owner.id, inbox.data[0].id);
        await prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: other.id } });
        await reminders.run(now);
        assert.equal((await prisma.staffAlert.findFirst({ where: { userId: owner.id } })).state, 'CANCELLED');
        assert.equal(await prisma.staffAlert.count({ where: { userId: other.id } }), 1);
        const jwt = u => ({ sub: u.id, email: u.email, role: u.role });
        assert.equal((await reminders.calendar(now.toISOString(), '2099-01-02T00:00:00Z', jwt(owner))).length, 0);
        assert.equal((await reminders.calendar(now.toISOString(), '2099-01-02T00:00:00Z', jwt(other))).length, 1);
        await prisma.travelBooking.update({ where: { id: booking.id }, data: { arrivalAt: new Date('2099-01-01T05:00:00Z') } });
        const pending = await prisma.staffAlert.findFirst({ where: { userId: other.id, state: 'QUEUED' } });
        await alerts.deliver(pending, now);
        assert.equal((await prisma.staffAlert.findUnique({ where: { id: pending.id } })).state, 'CANCELLED', 'Sending must revalidate a changed date');
        await reminders.run(now);
        await prisma.travelBooking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
        await reminders.run(now);
        assert.equal((await reminders.calendar(now.toISOString(), '2099-01-02T00:00:00Z', jwt(manager))).length, 0);
        await assert.rejects(reminders.calendar('bad', '2099-01-02', jwt(manager)));
        assert.equal(await prisma.staffAlert.count({ where: { channel: 'WHATSAPP' } }), 0);
        await prisma.appointment.update({ where: { id: appt.id }, data: { startTime: new Date('2099-01-01T07:00:00Z') } });
        await reminders.run(now);
        await alerts.run(now);
        const appointmentNotice = (await alerts.notifications(manager.id)).data.find(n => n.relatedEntityType === 'APPOINTMENT');
        assert(appointmentNotice.path.includes('at=2099-01-01T07%3A00%3A00.000Z'));
        await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'CANCELLED' } });
        await reminders.run(now);
        assert((await prisma.notification.findUnique({ where: { id: appointmentNotice.id } })).readAt);
      } finally {
        if (prisma) await prisma.$disconnect();
        await server.stop(); await db.close(); fs.rmSync(tmp, { recursive: true, force: true });
      }
    })().catch(e => { console.error(e); process.exitCode = 1; });
  `;
  execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', script], {
    cwd: join(__dirname, '../..'),
    env: { ...process.env, TS_NODE_PROJECT: 'tsconfig.json' },
    timeout: 30000,
    stdio: 'pipe',
  });
});
