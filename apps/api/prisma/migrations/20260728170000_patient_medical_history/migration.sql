-- The medical questionnaire a patient filled in, kept on the patient.
--
-- IntakeSubmission already captures medications, conditions, previous surgeries, smoking, alcohol,
-- pregnancy, blood thinners, height and weight. Conversion to a patient copied name, email and
-- phone and nothing else, so every clinical answer stayed stranded on the lead record — invisible
-- on the patient the dentist actually opens before treating them.
--
-- This is a safety gap, not a tidiness one: a dentist reading a patient record saw no mention of
-- blood thinners the patient had declared.
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "medications" TEXT;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "medicalConditions" TEXT;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "previousSurgeries" TEXT;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "isSmoker" BOOLEAN;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "drinksAlcohol" BOOLEAN;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "isPregnant" BOOLEAN;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "takesBloodThinners" BOOLEAN;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "heightCm" INTEGER;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "weightKg" INTEGER;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "nationality" TEXT;
