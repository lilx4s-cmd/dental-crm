-- What language to talk to a patient in.
--
-- The public enquiry form has always asked. The answer landed on `intake_submissions` and was
-- never copied to the lead — the same drop as `country`, in the same block of code.
--
-- 125 of the 152 deals that recorded a language in the old CRM were Arabic, in a clinic whose
-- staff and dossiers are English and Turkish. This decides who takes the case and whether a
-- translator is booked.
--
-- Nullable on purpose. "Nobody has said" is different from "English", and a default would send an
-- English treatment plan to somebody who cannot read it.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT;

-- Asked against the open pipeline: "which of my deals need an Arabic speaker".
CREATE INDEX IF NOT EXISTS "leads_preferredLanguage_idx" ON "leads"("preferredLanguage");
