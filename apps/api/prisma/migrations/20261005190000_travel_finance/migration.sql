-- CreateTable
CREATE TABLE "travel_bookings" (
 "calendarCycle" INTEGER NOT NULL DEFAULT 1,
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "visit" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "details" JSONB NOT NULL,
    "arrivalAt" TIMESTAMP(3),
    "departureAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_attachments" (
    "bookingId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "attachedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_attachments_pkey" PRIMARY KEY ("bookingId","fileId")
);

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "credentials" TEXT,
    "calendarId" TEXT,
    "account" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_oauth_states" (
    "hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_oauth_states_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "calendar_syncs" (
    "bookingId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "eventIds" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_syncs_pkey" PRIMARY KEY ("bookingId")
);

-- CreateTable
CREATE TABLE "cost_catalog_versions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_catalog_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_cost_snapshots" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "visit" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ESTIMATE',
    "details" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_cost_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compensation_rules" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compensation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "calculation" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_expenses" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "staffId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "details" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_changes" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previous" JSONB NOT NULL,
    "next" JSONB NOT NULL,
    "editorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "travel_bookings_arrivalAt_status_idx" ON "travel_bookings"("arrivalAt", "status");

-- CreateIndex
CREATE INDEX "travel_bookings_leadId_arrivalAt_idx" ON "travel_bookings"("leadId", "arrivalAt");

-- CreateIndex
CREATE UNIQUE INDEX "travel_bookings_patientId_leadId_visit_key" ON "travel_bookings"("patientId", "leadId", "visit");

-- CreateIndex
CREATE INDEX "calendar_syncs_state_nextAt_idx" ON "calendar_syncs"("state", "nextAt");

-- CreateIndex
CREATE INDEX "cost_catalog_versions_active_effectiveAt_idx" ON "cost_catalog_versions"("active", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "cost_catalog_versions_key_version_key" ON "cost_catalog_versions"("key", "version");

-- CreateIndex
CREATE INDEX "case_cost_snapshots_leadId_createdAt_idx" ON "case_cost_snapshots"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "case_cost_snapshots_patientId_leadId_visit_version_key" ON "case_cost_snapshots"("patientId", "leadId", "visit", "version");

-- CreateIndex
CREATE INDEX "compensation_rules_staffId_effectiveAt_idx" ON "compensation_rules"("staffId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "compensation_rules_staffId_version_key" ON "compensation_rules"("staffId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_dedupeKey_key" ON "commission_entries"("dedupeKey");

-- CreateIndex
CREATE INDEX "commission_entries_staffId_createdAt_idx" ON "commission_entries"("staffId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "business_expenses_dedupeKey_key" ON "business_expenses"("dedupeKey");

-- CreateIndex
CREATE INDEX "business_expenses_month_currency_idx" ON "business_expenses"("month", "currency");

-- CreateIndex
CREATE INDEX "financial_changes_entityType_entityId_createdAt_idx" ON "financial_changes"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_attachments" ADD CONSTRAINT "travel_attachments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "travel_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_attachments" ADD CONSTRAINT "travel_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_syncs" ADD CONSTRAINT "calendar_syncs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "travel_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE travel_bookings ADD CONSTRAINT travel_visit_check CHECK (visit IN (1,2)), ADD CONSTRAINT travel_status_check CHECK (status IN ('DRAFT','CONFIRMED','ARRIVED','COMPLETED','CANCELLED'));
ALTER TABLE case_cost_snapshots ADD CONSTRAINT costs_patient_fk FOREIGN KEY ("patientId") REFERENCES patients(id), ADD CONSTRAINT costs_lead_fk FOREIGN KEY ("leadId") REFERENCES leads(id), ADD CONSTRAINT costs_creator_fk FOREIGN KEY ("createdById") REFERENCES users(id);
ALTER TABLE compensation_rules ADD CONSTRAINT compensation_staff_fk FOREIGN KEY ("staffId") REFERENCES users(id), ADD CONSTRAINT compensation_creator_fk FOREIGN KEY ("createdById") REFERENCES users(id);
ALTER TABLE commission_entries ADD CONSTRAINT commission_staff_fk FOREIGN KEY ("staffId") REFERENCES users(id), ADD CONSTRAINT commission_patient_fk FOREIGN KEY ("patientId") REFERENCES patients(id), ADD CONSTRAINT commission_lead_fk FOREIGN KEY ("leadId") REFERENCES leads(id), ADD CONSTRAINT commission_rule_fk FOREIGN KEY ("ruleId") REFERENCES compensation_rules(id);
ALTER TABLE business_expenses ADD CONSTRAINT expense_staff_fk FOREIGN KEY ("staffId") REFERENCES users(id), ADD CONSTRAINT expense_creator_fk FOREIGN KEY ("createdById") REFERENCES users(id);
ALTER TABLE financial_changes ADD CONSTRAINT financial_editor_fk FOREIGN KEY ("editorId") REFERENCES users(id);
ALTER TABLE travel_attachments ADD CONSTRAINT attachment_staff_fk FOREIGN KEY ("attachedById") REFERENCES users(id);
CREATE TABLE case_calculation_work("leadId" TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 1, "processedRevision" INTEGER NOT NULL DEFAULT 0, "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, error TEXT);
CREATE INDEX case_calculation_due_idx ON case_calculation_work("nextAt") WHERE revision>"processedRevision";
CREATE FUNCTION queue_case_calculation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE deal TEXT;
BEGIN
 IF TG_TABLE_NAME='payments' THEN
  SELECT p."convertedFromLeadId" INTO deal FROM invoices i JOIN patients p ON p.id=i."patientId" WHERE i.id=NEW."invoiceId";
 ELSIF TG_TABLE_NAME='leads' THEN deal:=NEW.id;
 ELSE deal:=NEW."leadId";
 END IF;
 IF deal IS NOT NULL THEN INSERT INTO case_calculation_work("leadId") VALUES(deal) ON CONFLICT("leadId") DO UPDATE SET revision=case_calculation_work.revision+1,"nextAt"=CURRENT_TIMESTAMP,error=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER travel_cost_calculation AFTER INSERT OR UPDATE ON travel_bookings FOR EACH ROW EXECUTE FUNCTION queue_case_calculation();
CREATE TRIGGER snapshot_cost_calculation AFTER INSERT ON case_cost_snapshots FOR EACH ROW EXECUTE FUNCTION queue_case_calculation();
CREATE TRIGGER payment_cost_calculation AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION queue_case_calculation();
CREATE TRIGGER assignment_cost_calculation AFTER UPDATE OF "assignedToId" ON leads FOR EACH ROW WHEN(OLD."assignedToId" IS DISTINCT FROM NEW."assignedToId") EXECUTE FUNCTION queue_case_calculation();
CREATE FUNCTION immutable_financial_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial versions and audit records are immutable; create a new version or audited exception'; END $$;
CREATE TRIGGER immutable_catalog BEFORE UPDATE OR DELETE ON cost_catalog_versions FOR EACH ROW EXECUTE FUNCTION immutable_financial_version();
CREATE TRIGGER immutable_costs BEFORE UPDATE OR DELETE ON case_cost_snapshots FOR EACH ROW EXECUTE FUNCTION immutable_financial_version();
CREATE TRIGGER immutable_compensation BEFORE UPDATE OR DELETE ON compensation_rules FOR EACH ROW EXECUTE FUNCTION immutable_financial_version();
CREATE TRIGGER immutable_financial_audit BEFORE UPDATE OR DELETE ON financial_changes FOR EACH ROW EXECUTE FUNCTION immutable_financial_version();
CREATE TABLE ticket_extractions("bookingId" TEXT NOT NULL REFERENCES travel_bookings(id) ON DELETE CASCADE,"fileId" TEXT NOT NULL REFERENCES files(id),"requestedById" TEXT NOT NULL REFERENCES users(id),state TEXT NOT NULL DEFAULT 'QUEUED',suggestions JSONB NOT NULL DEFAULT '{}',error TEXT,"requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"startedAt" TIMESTAMP(3),PRIMARY KEY("bookingId","fileId"));
CREATE INDEX ticket_extraction_pending_idx ON ticket_extractions(state,"requestedAt");
CREATE FUNCTION freeze_approved_case_costs() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE snapshot RECORD;
BEGIN
 IF NEW."approvalStatus"::text='APPROVED' AND OLD."approvalStatus"::text IS DISTINCT FROM 'APPROVED' THEN
  FOR snapshot IN SELECT DISTINCT ON ("patientId","leadId",visit) * FROM case_cost_snapshots WHERE details->>'treatmentPlanId'=NEW.id ORDER BY "patientId","leadId",visit,version DESC LOOP
   IF snapshot.state='ESTIMATE' THEN
    INSERT INTO case_cost_snapshots(id,"patientId","leadId",visit,version,state,details,"createdById") SELECT gen_random_uuid()::text,snapshot."patientId",snapshot."leadId",snapshot.visit,COALESCE(MAX(version),0)+1,'CONFIRMED',snapshot.details,snapshot."createdById" FROM case_cost_snapshots WHERE "patientId"=snapshot."patientId" AND "leadId"=snapshot."leadId" AND visit=snapshot.visit;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approved_plan_cost_snapshot AFTER UPDATE OF "approvalStatus" ON treatment_plans FOR EACH ROW EXECUTE FUNCTION freeze_approved_case_costs();
