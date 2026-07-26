-- Case economics. Only the two figures the clinic actually enters are stored; price, paid and
-- profit are derived from the existing invoices and payments so there is one answer to "how much
-- has this patient paid" rather than two that can drift apart.
ALTER TABLE "patients" ADD COLUMN "serviceCost" DECIMAL(12,2);
ALTER TABLE "patients" ADD COLUMN "salesCommission" DECIMAL(12,2);
ALTER TABLE "patients" ADD COLUMN "commissionUserId" TEXT;

ALTER TABLE "patients" ADD CONSTRAINT "patients_commissionUserId_fkey"
  FOREIGN KEY ("commissionUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A short reference staff can say out loud. A sequence rather than counting existing rows, because
-- two people admitting patients at the same moment would otherwise compute the same number and one
-- of the inserts would fail on the unique index.
CREATE SEQUENCE IF NOT EXISTS "patient_case_seq" START 1;

ALTER TABLE "patients" ADD COLUMN "caseNumber" TEXT;

-- Backfill oldest-first so the numbers run in roughly the order patients arrived.
WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt") AS rn FROM "patients"
)
UPDATE "patients" p
SET "caseNumber" = 'P-' || to_char(p."createdAt", 'YYYY') || '-' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE p."id" = o."id";

-- Move the sequence past everything just handed out.
SELECT setval('patient_case_seq', GREATEST((SELECT count(*) FROM "patients"), 1));

ALTER TABLE "patients"
  ALTER COLUMN "caseNumber"
  SET DEFAULT 'P-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('patient_case_seq')::text, 4, '0');

CREATE UNIQUE INDEX "patients_caseNumber_key" ON "patients"("caseNumber");
