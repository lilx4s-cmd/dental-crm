-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "competitorName" TEXT,
ADD COLUMN     "competitorPrice" DECIMAL(12,2),
ADD COLUMN     "lostReasonCode" TEXT,
ADD COLUMN     "lostReasonDetail" TEXT,
ADD COLUMN     "reviewAt" TIMESTAMP(3),
ADD COLUMN     "temperature" TEXT NOT NULL DEFAULT 'WARM',
ADD COLUMN     "waitingReason" TEXT;

-- AlterTable
ALTER TABLE "lead_tasks" ADD COLUMN     "quoteVersionId" TEXT,
ADD COLUMN     "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rescheduleReason" TEXT;

-- CreateTable
CREATE TABLE "sales_rules" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL DEFAULT 'singleton',
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "thresholdMinutes" INTEGER,
    "warningMinutes" INTEGER,
    "escalationMinutes" INTEGER NOT NULL DEFAULT 30,
    "severity" TEXT NOT NULL DEFAULT 'ORANGE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_issues" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL DEFAULT 'singleton',
    "leadId" TEXT NOT NULL,
    "patientId" TEXT,
    "assignedUserId" TEXT,
    "supervisorUserId" TEXT,
    "ruleKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "actionPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "redSince" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "firstViolationAt" TIMESTAMP(3) NOT NULL,
    "lastViolationAt" TIMESTAMP(3) NOT NULL,
    "autoResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolutionReason" TEXT,
    "dismissedFingerprint" TEXT,
    "fingerprint" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaching_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_issue_events" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_issue_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_dirty" (
    "leadId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "coaching_dirty_pkey" PRIMARY KEY ("leadId")
);

-- CreateTable
CREATE TABLE "supervisor_instructions" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'ORANGE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "readAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_requirements" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL DEFAULT 'singleton',
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assessment_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_assessments" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "treatmentCategory" TEXT NOT NULL DEFAULT 'DENTAL',
    "status" TEXT NOT NULL DEFAULT 'COLLECTING_INFORMATION',
    "requestedById" TEXT,
    "reviewerId" TEXT,
    "requestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "clinicalNotes" TEXT,
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_versions" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "currency" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "changeReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_promises" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "responsibleUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_promises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_evidence" (
    "leadId" TEXT NOT NULL,
    "firstContactAt" TIMESTAMP(3),
    "firstContactUserId" TEXT,
    "firstContactChannel" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastMeaningfulActivityAt" TIMESTAMP(3),
    "lastContactedByUserId" TEXT,
    "firstResponseTimeSeconds" INTEGER,
    "latestResponseTimeSeconds" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_evidence_pkey" PRIMARY KEY ("leadId")
);

-- CreateTable
CREATE TABLE "response_observations" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "inboundAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "responseSeconds" INTEGER,
    "slaSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_rules_clinicId_key_key" ON "sales_rules"("clinicId", "key");

-- CreateIndex
CREATE INDEX "coaching_issues_clinicId_assignedUserId_status_severity_idx" ON "coaching_issues"("clinicId", "assignedUserId", "status", "severity");

-- CreateIndex
CREATE INDEX "coaching_issues_leadId_ruleKey_idx" ON "coaching_issues"("leadId", "ruleKey");

-- CreateIndex
CREATE INDEX "coaching_issues_detectedAt_idx" ON "coaching_issues"("detectedAt");

-- CreateIndex
CREATE INDEX "coaching_issue_events_issueId_createdAt_idx" ON "coaching_issue_events"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "coaching_dirty_retryAt_updatedAt_idx" ON "coaching_dirty"("retryAt", "updatedAt");

-- CreateIndex
CREATE INDEX "supervisor_instructions_salespersonId_status_createdAt_idx" ON "supervisor_instructions"("salespersonId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_requirements_clinicId_category_key_key" ON "assessment_requirements"("clinicId", "category", "key");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_assessments_leadId_key" ON "clinical_assessments"("leadId");

-- CreateIndex
CREATE INDEX "quote_versions_leadId_sentAt_idx" ON "quote_versions"("leadId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "quote_versions_leadId_version_key" ON "quote_versions"("leadId", "version");

-- CreateIndex
CREATE INDEX "payment_promises_leadId_status_dueAt_idx" ON "payment_promises"("leadId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "response_observations_inboundMessageId_key" ON "response_observations"("inboundMessageId");

-- CreateIndex
CREATE INDEX "response_observations_assignedUserId_inboundAt_idx" ON "response_observations"("assignedUserId", "inboundAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_tasks_quoteVersionId_key" ON "lead_tasks"("quoteVersionId");

-- CreateIndex
CREATE INDEX "lead_tasks_assignedToId_completedAt_dueDate_idx" ON "lead_tasks"("assignedToId", "completedAt", "dueDate");

-- AddForeignKey
ALTER TABLE "coaching_issues" ADD CONSTRAINT "coaching_issues_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_issues" ADD CONSTRAINT "coaching_issues_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_issues" ADD CONSTRAINT "coaching_issues_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_issue_events" ADD CONSTRAINT "coaching_issue_events_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "coaching_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_dirty" ADD CONSTRAINT "coaching_dirty_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_instructions" ADD CONSTRAINT "supervisor_instructions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_instructions" ADD CONSTRAINT "supervisor_instructions_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_instructions" ADD CONSTRAINT "supervisor_instructions_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_assessments" ADD CONSTRAINT "clinical_assessments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_assessments" ADD CONSTRAINT "clinical_assessments_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_evidence" ADD CONSTRAINT "contact_evidence_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_observations" ADD CONSTRAINT "response_observations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One live issue per rule and lead; resolved history is retained.
CREATE UNIQUE INDEX coaching_issue_one_active ON coaching_issues ("leadId", "ruleKey") WHERE status IN ('OPEN','ACKNOWLEDGED','ESCALATED');
ALTER TABLE coaching_issues ADD CONSTRAINT coaching_issue_status CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','ESCALATED','DISMISSED'));
ALTER TABLE coaching_issues ADD CONSTRAINT coaching_issue_severity CHECK (severity IN ('YELLOW','ORANGE','RED'));
ALTER TABLE sales_rules ADD CONSTRAINT sales_rule_thresholds CHECK (("thresholdMinutes" IS NULL OR "thresholdMinutes" >= 0) AND ("warningMinutes" IS NULL OR "warningMinutes" >= 0) AND "escalationMinutes" >= 0);
ALTER TABLE leads ADD CONSTRAINT lead_temperature CHECK (temperature IN ('HOT','WARM','COLD'));

-- Historical assignment times were not stored; use creation time to retain contact evidence.
UPDATE leads SET "assignedAt" = "createdAt";

CREATE FUNCTION coaching_enqueue(target TEXT) RETURNS VOID AS $$
BEGIN
  IF target IS NOT NULL AND EXISTS (SELECT 1 FROM leads WHERE id = target) THEN
    INSERT INTO coaching_dirty ("leadId", revision, "updatedAt", attempts, "retryAt") VALUES (target, 1, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("leadId") DO UPDATE SET revision = coaching_dirty.revision + 1, "updatedAt" = CURRENT_TIMESTAMP, "retryAt" = CURRENT_TIMESTAMP, attempts = 0, "lastError" = NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION coaching_assignment_clock() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."assignedToId" IS DISTINCT FROM OLD."assignedToId" THEN
    NEW."assignedAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER coaching_assignment_clock BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION coaching_assignment_clock();

CREATE FUNCTION coaching_task_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."dueDate" IS DISTINCT FROM OLD."dueDate" THEN
    IF NEW."rescheduleReason" IS NULL OR length(trim(NEW."rescheduleReason")) < 3 THEN
      RAISE EXCEPTION 'A follow-up reschedule reason is required';
    END IF;
    NEW."rescheduleCount" := OLD."rescheduleCount" + 1;
    INSERT INTO lead_activities (id,"leadId","userId",note,"createdAt") VALUES (gen_random_uuid()::text, NEW."leadId", NEW."assignedToId", 'Follow-up rescheduled: ' || NEW.title || ' from ' || OLD."dueDate"::text || ' to ' || NEW."dueDate"::text || '. Reason: ' || NEW."rescheduleReason", CURRENT_TIMESTAMP);
  END IF;
  IF NEW."completedAt" IS DISTINCT FROM OLD."completedAt" THEN
    INSERT INTO lead_activities (id,"leadId","userId",note,"createdAt") VALUES (gen_random_uuid()::text, NEW."leadId", NEW."assignedToId", CASE WHEN NEW."completedAt" IS NULL THEN 'Follow-up reopened: ' ELSE 'Follow-up completed: ' END || NEW.title, CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER coaching_task_change BEFORE UPDATE ON lead_tasks FOR EACH ROW EXECUTE FUNCTION coaching_task_change();

-- These triggers form the transactional outbox, including non-HTTP phone-session capture.
CREATE FUNCTION coaching_dirty_event() RETURNS TRIGGER AS $$
DECLARE rowdata JSONB; target TEXT; patient TEXT; previous JSONB;
BEGIN
  rowdata := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME = 'leads' THEN target := rowdata->>'id';
  ELSIF TG_TABLE_NAME IN ('lead_tasks','call_logs','clinical_assessments','quote_versions','payment_promises') THEN target := rowdata->>'leadId';
  ELSIF TG_TABLE_NAME = 'messages' THEN
    SELECT COALESCE(c."leadId",p."convertedFromLeadId") INTO target FROM conversations c LEFT JOIN patients p ON p.id = c."patientId" WHERE c.id = rowdata->>'conversationId';
  ELSIF TG_TABLE_NAME = 'conversations' THEN
    target := rowdata->>'leadId';
    IF target IS NULL THEN SELECT "convertedFromLeadId" INTO target FROM patients WHERE id = rowdata->>'patientId'; END IF;
    IF TG_OP = 'UPDATE' THEN
      previous := to_jsonb(OLD);
      PERFORM coaching_enqueue(previous->>'leadId');
    END IF;
  ELSIF TG_TABLE_NAME IN ('appointments','treatment_plans','invoices','patients') THEN
    patient := CASE WHEN TG_TABLE_NAME = 'patients' THEN rowdata->>'id' ELSE rowdata->>'patientId' END;
    SELECT "convertedFromLeadId" INTO target FROM patients WHERE id = patient;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    SELECT p."convertedFromLeadId" INTO target FROM invoices i JOIN patients p ON p.id = i."patientId" WHERE i.id = rowdata->>'invoiceId';
  ELSIF TG_TABLE_NAME = 'files' THEN
    IF rowdata->>'ownerType' = 'LEAD' THEN target := rowdata->>'ownerId';
    ELSIF rowdata->>'ownerType' = 'PATIENT' THEN SELECT "convertedFromLeadId" INTO target FROM patients WHERE id = rowdata->>'ownerId'; END IF;
  END IF;
  PERFORM coaching_enqueue(target);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DO $$ DECLARE tab TEXT;
BEGIN
  FOREACH tab IN ARRAY ARRAY['leads','lead_tasks','call_logs','messages','conversations','patients','appointments','treatment_plans','invoices','payments','files','clinical_assessments','quote_versions','payment_promises'] LOOP
    EXECUTE format('CREATE TRIGGER coaching_dirty_event AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION coaching_dirty_event()',tab);
  END LOOP;
END $$;
INSERT INTO coaching_dirty ("leadId",revision,"updatedAt",attempts,"retryAt") SELECT id,1,CURRENT_TIMESTAMP,0,CURRENT_TIMESTAMP FROM leads WHERE status='ACTIVE' AND "mergedIntoId" IS NULL;
