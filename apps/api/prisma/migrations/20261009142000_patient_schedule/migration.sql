-- A converted deal is not evidence that treatment has finished. Existing patients remain
-- working until authorized staff explicitly confirm completion of the treatment course.
ALTER TABLE "patients" ADD COLUMN "treatmentStatus" TEXT NOT NULL DEFAULT 'WORKING';
ALTER TABLE "patients" ADD COLUMN "treatmentFinishedAt" TIMESTAMP(3);
ALTER TABLE "patients" ADD CONSTRAINT "patients_treatmentStatus_check" CHECK ("treatmentStatus" IN ('WORKING', 'FINISHED'));
CREATE INDEX "patients_isActive_treatmentStatus_idx" ON "patients"("isActive", "treatmentStatus");
ALTER TABLE "staff_alerts" ADD COLUMN "schedule" JSONB;
-- Refresh future flights in connected Google calendars using the existing sync worker.
UPDATE "calendar_syncs" AS c
SET "state" = 'PENDING', "attempts" = 0, "nextAt" = NOW(), "lockedAt" = NULL, "error" = NULL, "updatedAt" = NOW()
WHERE c."state" <> 'PROCESSING' AND EXISTS (
  SELECT 1 FROM "travel_bookings" AS b WHERE b."id" = c."bookingId"
  AND b."status" IN ('CONFIRMED', 'ARRIVED', 'COMPLETED')
  AND (b."arrivalAt" > NOW() OR b."departureAt" > NOW())
);
