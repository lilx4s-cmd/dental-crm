-- Country on leads, so a phone number can be read correctly (Q4).
--
-- A leading zero is a national trunk prefix and means nothing without a country. Every
-- local-format number was therefore assumed Turkish, so a Saudi patient writing 055 512 3456 —
-- the way they write it at home — was stored as a real Turkish number belonging to somebody else.
-- The clinic advertises across the Gulf, so this was not an edge case.
--
-- Hand-authored and idempotent; runs against the live database. Nullable with no default, so all
-- 1,005 existing rows are untouched by this file. The backfill is a separate, reviewable step —
-- see scripts/backfill-lead-country.ts — because guessing a country and writing it silently is
-- the same class of mistake this column exists to fix.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "country" TEXT;

-- Cost per lead by market is the first question anyone asks once this exists.
CREATE INDEX IF NOT EXISTS "leads_country_idx" ON "leads" ("country");
