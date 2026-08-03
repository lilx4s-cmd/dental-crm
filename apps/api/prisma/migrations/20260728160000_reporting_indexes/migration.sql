-- Indexes for the columns the reporting layer actually filters and sorts on.
--
-- Invoice, Payment and LeadActivity carried no indexes at all — not one between them — and they
-- are precisely the tables every financial report reads. Every revenue figure, every KPI card and
-- every activity feed was a sequential scan.
--
-- CONCURRENTLY is deliberately not used: these tables are small today (five treatment plans, a
-- handful of invoices) so the locks are momentary, and CONCURRENTLY cannot run inside the
-- transaction Prisma wraps a migration in.

-- Money. `status, paidAt` is the hottest predicate in the system: the revenue chart groups on it
-- and the KPI snapshot filters on it twice.
CREATE INDEX IF NOT EXISTS "payments_status_paidAt_idx" ON "payments"("status", "paidAt");
CREATE INDEX IF NOT EXISTS "payments_invoiceId_idx" ON "payments"("invoiceId");
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices"("status");
CREATE INDEX IF NOT EXISTS "invoices_patientId_idx" ON "invoices"("patientId");
CREATE INDEX IF NOT EXISTS "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- Activity. Read per lead on the detail sheet, and paginated by user for the team feed.
CREATE INDEX IF NOT EXISTS "lead_activities_leadId_idx" ON "lead_activities"("leadId");
CREATE INDEX IF NOT EXISTS "lead_activities_userId_createdAt_idx" ON "lead_activities"("userId", "createdAt");

-- Leads. `status` is set on every pipeline query by the shared where-builder; `source` is needed
-- for the filter bar and for source attribution; `createdAt` orders the board and the lists.
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads"("status");
CREATE INDEX IF NOT EXISTS "leads_source_idx" ON "leads"("source");
CREATE INDEX IF NOT EXISTS "leads_createdAt_idx" ON "leads"("createdAt");
CREATE INDEX IF NOT EXISTS "leads_campaignId_idx" ON "leads"("campaignId");

-- Patients. Growth reporting range-scans createdAt inside the active set.
CREATE INDEX IF NOT EXISTS "patients_isActive_createdAt_idx" ON "patients"("isActive", "createdAt");

-- Treatment plans are always fetched for one patient.
CREATE INDEX IF NOT EXISTS "treatment_plans_patientId_idx" ON "treatment_plans"("patientId");
