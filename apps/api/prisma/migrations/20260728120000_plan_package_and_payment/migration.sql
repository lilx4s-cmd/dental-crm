-- What the price includes, and how it is paid.
--
-- The clinic's existing Word quotation carries both and the CRM had nowhere to put either: the
-- package ("hotel, medication, X-rays and all aftercare, no hidden fees") is the strongest thing on
-- that document, and the payment terms are a commercial position -- 16% on international cards,
-- nothing in cash -- that a coordinator was retyping by hand into every proposal. Retyped terms
-- are terms that eventually disagree with each other.
--
-- Held on the plan rather than only on the clinic, because a plan quoted in March has to still say
-- what was promised in March after the clinic changes its card fee in June. Defaults come from
-- clinic settings at the moment the plan is created; the copy on the plan is what the patient was
-- shown.

-- Package inclusions, as a set of keys the document renders with its own labels and icons. A text
-- array rather than a table: this is a checklist with no attributes of its own, and a join table
-- for it would be five queries to answer "what did we promise this patient".
ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "packageIncludes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Payment terms as quoted. Nullable throughout: a plan being drafted has none of this yet, and a
-- zero would read as "no deposit required", which is a different promise from "not yet decided".
ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "depositAmount" DECIMAL(12,2);
ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "cardFeePercent" DECIMAL(5,2);
ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "cashDiscountPercent" DECIMAL(5,2);
ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "flightRefundNote" TEXT;
ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;

-- The language the dossier is issued in. The patient reads one language; the clinic works in
-- another. Stored per plan so reissuing a document reproduces what was sent rather than whatever
-- the coordinator's browser happens to be set to today.
ALTER TABLE "treatment_plans" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';

-- Clinic-wide defaults, so the coordinator sets them once and every new plan starts filled in.
-- This is the difference between a two-minute proposal and a twenty-minute one.
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "defaultPackageIncludes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "defaultCardFeePercent" DECIMAL(5,2);
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "defaultCashDiscountPercent" DECIMAL(5,2);
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "defaultDepositPercent" DECIMAL(5,2);
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "defaultPaymentTerms" TEXT;
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "defaultWarrantyTerms" TEXT;
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
ALTER TABLE "clinic_settings" ADD COLUMN IF NOT EXISTS "website" TEXT;
