-- Joins the printed itinerary to the booked calendar.
--
-- A treatment plan carries a day-by-day schedule that is printed and sent to the patient, and the
-- clinic separately books appointments in the diary. Nothing connected them: a coordinator could
-- promise "surgery on Wednesday" in a dossier the patient is holding, with nothing in the calendar
-- on Wednesday, and no screen anywhere would show the discrepancy.
--
-- Both directions are recorded because both questions get asked. From the itinerary: is this line
-- actually booked? From the diary: which plan is this appointment for?
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "treatmentPlanId" TEXT;

ALTER TABLE "treatment_plan_schedule_items" ADD COLUMN IF NOT EXISTS "appointmentId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_treatmentPlanId_fkey') THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_treatmentPlanId_fkey"
      FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id")
      -- The appointment survives the plan being deleted: it happened, and a chair was occupied.
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plan_schedule_items_appointmentId_fkey') THEN
    ALTER TABLE "treatment_plan_schedule_items"
      ADD CONSTRAINT "treatment_plan_schedule_items_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
      -- Cancelling the booking leaves the itinerary line standing, unbooked, which is exactly the
      -- state somebody needs to see rather than the line quietly disappearing.
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- One booking realises at most one itinerary line, so a partial index enforces it while still
-- allowing any number of unbooked lines.
CREATE UNIQUE INDEX IF NOT EXISTS "treatment_plan_schedule_items_appointmentId_key"
  ON "treatment_plan_schedule_items"("appointmentId") WHERE "appointmentId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "appointments_treatmentPlanId_idx" ON "appointments"("treatmentPlanId");
