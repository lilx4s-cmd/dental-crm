-- Cases sent out to the laboratory.
--
-- Crowns, veneers and bridges are made by an external lab, and the CRM had nowhere to record that
-- a case had been sent, what shade was asked for, or when it is due back. Lab work existed only as
-- a lump sum in Patient.serviceCost — a number, with no case behind it. The practical consequence
-- is that nobody could answer "is Marie's bridge back before she flies home on Friday?" without
-- ringing the lab.
--
-- Attached to the plan rather than to a single item: one dispatch usually carries several units,
-- and splitting it per tooth would mean chasing five orders for one parcel.
CREATE TYPE "LabOrderStatus" AS ENUM ('DRAFT', 'SENT', 'IN_PRODUCTION', 'READY', 'RECEIVED', 'REMAKE');

CREATE TABLE IF NOT EXISTS "lab_orders" (
  "id"              TEXT NOT NULL,
  "treatmentPlanId" TEXT NOT NULL,
  "labName"         TEXT NOT NULL,
  "status"          "LabOrderStatus" NOT NULL DEFAULT 'DRAFT',
  -- What was asked for. Shade and material are the two things a remake is usually caused by, so
  -- they are recorded rather than left in a note.
  "shade"           TEXT,
  "material"        TEXT,
  -- Which teeth this dispatch covers, as FDI numbers. An array rather than a join table: this is a
  -- list with no attributes of its own, and a table would turn one question into two queries.
  "toothNumbers"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sentAt"          TIMESTAMP(3),
  -- The date the case has to be back for the patient's appointment, which is what makes an order
  -- late rather than merely open.
  "dueAt"           TIMESTAMP(3),
  "receivedAt"      TIMESTAMP(3),
  "trackingRef"     TEXT,
  "notes"           TEXT,
  "createdById"     TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lab_orders"
  ADD CONSTRAINT "lab_orders_treatmentPlanId_fkey"
  FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lab_orders"
  ADD CONSTRAINT "lab_orders_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "lab_orders_treatmentPlanId_idx" ON "lab_orders"("treatmentPlanId");
-- The overdue query: everything not yet received, ordered by when it was due.
CREATE INDEX IF NOT EXISTS "lab_orders_status_dueAt_idx" ON "lab_orders"("status", "dueAt");
