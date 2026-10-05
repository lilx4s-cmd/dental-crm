ALTER TABLE commission_entries ADD COLUMN "earnedAt" TIMESTAMP(3);
UPDATE commission_entries SET "earnedAt" = COALESCE("approvedAt", "paidAt", "createdAt") WHERE state IN ('EARNED','APPROVED','PAID');
CREATE INDEX commission_entries_staffId_earnedAt_idx ON commission_entries("staffId", "earnedAt");
CREATE INDEX commission_entries_paidAt_idx ON commission_entries("paidAt");
CREATE INDEX commission_entries_leadId_idx ON commission_entries("leadId");
CREATE TRIGGER completed_case_calculation AFTER UPDATE OF stage ON leads FOR EACH ROW WHEN (OLD.stage IS DISTINCT FROM NEW.stage) EXECUTE FUNCTION queue_case_calculation();
