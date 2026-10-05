ALTER TABLE "users" ADD COLUMN "notificationPhone" TEXT, ADD COLUMN "notificationPreferences" JSONB;
CREATE UNIQUE INDEX "users_notificationPhone_key" ON "users"("notificationPhone");
ALTER TABLE "clinic_settings" ADD COLUMN "notificationSettings" JSONB;
ALTER TABLE "leads" ADD COLUMN "assignmentRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "lead_assignment_events" (
 "id" TEXT PRIMARY KEY, "leadId" TEXT NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
 "revision" INTEGER NOT NULL, "assignedToId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "remindedAt" TIMESTAMP(3), "escalatedAt" TIMESTAMP(3), "initializedAt" TIMESTAMP(3), "reminderAt" TIMESTAMP(3), "escalationAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "lead_assignment_events_leadId_revision_key" ON "lead_assignment_events"("leadId","revision");
CREATE INDEX "lead_assignment_events_closedAt_createdAt_idx" ON "lead_assignment_events"("closedAt","createdAt");
CREATE TABLE "staff_alerts" (
 "id" TEXT PRIMARY KEY, "eventId" TEXT REFERENCES "lead_assignment_events"("id") ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "kind" TEXT NOT NULL, "channel" TEXT NOT NULL CHECK ("channel" IN ('WHATSAPP','PUSH','IN_APP')),
 "dedupeKey" TEXT NOT NULL UNIQUE, "state" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("state" IN ('QUEUED','SENDING','ACCEPTED','DELIVERED','FAILED','UNCERTAIN','CANCELLED')),
 "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "attemptedAt" TIMESTAMP(3), "acceptedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3),
 "attempts" INTEGER NOT NULL DEFAULT 0, "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "staff_alerts_state_dueAt_idx" ON "staff_alerts"("state","dueAt");
CREATE INDEX "staff_alerts_userId_createdAt_idx" ON "staff_alerts"("userId","createdAt");
CREATE TABLE "push_devices" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "endpoint" TEXT NOT NULL UNIQUE, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "push_devices_userId_idx" ON "push_devices"("userId");
-- Covers every existing lead source and bulk reassignment without coupling saves to a provider.
-- Existing leads are not backfilled: enabling alerts must not spam the clinic's historical leads.
CREATE FUNCTION crm_assignment_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN NEW."assignmentRevision" := 1;
 ELSIF NEW."assignedToId" IS DISTINCT FROM OLD."assignedToId" THEN NEW."assignmentRevision" := OLD."assignmentRevision" + 1;
 ELSE NEW."assignmentRevision" := OLD."assignmentRevision"; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_assignment_revision BEFORE INSERT OR UPDATE ON "leads" FOR EACH ROW EXECUTE FUNCTION crm_assignment_revision();
CREATE FUNCTION crm_assignment_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' OR NEW."assignmentRevision" <> OLD."assignmentRevision" THEN
  INSERT INTO "lead_assignment_events" ("id","leadId","revision","assignedToId") VALUES (gen_random_uuid()::text,NEW."id",NEW."assignmentRevision",NEW."assignedToId");
  UPDATE "staff_alerts" SET "state"='CANCELLED',"error"='Lead assignment changed' WHERE "eventId" IN (SELECT "id" FROM "lead_assignment_events" WHERE "leadId"=NEW."id" AND "revision"<>NEW."assignmentRevision") AND "state"='QUEUED';
  UPDATE "lead_assignment_events" SET "closedAt"=CURRENT_TIMESTAMP WHERE "leadId"=NEW."id" AND "revision"<>NEW."assignmentRevision" AND "closedAt" IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_assignment_event AFTER INSERT OR UPDATE ON "leads" FOR EACH ROW EXECUTE FUNCTION crm_assignment_event();

ALTER TABLE lead_activities ADD COLUMN "contactRecordedAt" TIMESTAMP(3), ADD COLUMN "contactMethod" TEXT;
