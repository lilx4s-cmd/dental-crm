ALTER TABLE "clinic_settings" ADD COLUMN "documentConfiguration" JSONB;
ALTER TABLE "treatment_plans" ADD COLUMN "consultation" JSONB;
ALTER TABLE "warranties" ADD COLUMN "certificateNumber" TEXT;
CREATE UNIQUE INDEX "warranties_certificateNumber_key" ON "warranties"("certificateNumber");
CREATE TABLE "document_versions" (
 "id" TEXT NOT NULL PRIMARY KEY, "kind" TEXT NOT NULL CHECK ("kind" IN ('PLAN','INVOICE','WARRANTY')),
 "sourceId" TEXT NOT NULL, "version" INTEGER NOT NULL, "patientId" TEXT NOT NULL,
 "leadId" TEXT, "treatmentPlanId" TEXT, "invoiceId" TEXT, "warrantyId" TEXT,
 "language" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "snapshot" JSONB NOT NULL, "pdfData" BYTEA NOT NULL, "verificationHash" TEXT NOT NULL,
 CONSTRAINT "document_versions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT,
 CONSTRAINT "document_versions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL,
 CONSTRAINT "document_versions_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE RESTRICT,
 CONSTRAINT "document_versions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT,
 CONSTRAINT "document_versions_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "warranties"("id") ON DELETE RESTRICT,
 CONSTRAINT "document_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "document_versions_kind_sourceId_version_key" ON "document_versions"("kind", "sourceId", "version");
CREATE UNIQUE INDEX "document_versions_verificationHash_key" ON "document_versions"("verificationHash");
CREATE INDEX "document_versions_patientId_createdAt_idx" ON "document_versions"("patientId", "createdAt");
CREATE INDEX "document_versions_leadId_createdAt_idx" ON "document_versions"("leadId", "createdAt");

ALTER TABLE "treatment_plan_items" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "warranty_templates" ADD COLUMN "lifetime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "warranty_templates" ADD COLUMN "procedureType" TEXT;
ALTER TABLE "warranties" ADD COLUMN "lifetime" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "treatment_plans" ADD COLUMN "approvedDocumentVersionId" TEXT;
