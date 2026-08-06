-- Tags for deals, and the organisation column that makes a second clinic possible.
--
-- `tags` and `patient_tags` were both empty in production when this ran (verified, 0 rows each),
-- which is why this reshapes `tags` in place rather than migrating it: the tags module was written
-- with three endpoints and never given a UI, so nobody could ever make a tag. Dropping and
-- recreating the colour column destroys nothing.
--
-- Written by hand and idempotent throughout. This runs against a live database holding 1005 deals
-- and real patient records.

-- ── Enums ───────────────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "TagColor" AS ENUM ('SLATE','RED','ORANGE','AMBER','GREEN','TEAL','BLUE','INDIGO','VIOLET','PINK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TagCategory" AS ENUM ('TREATMENT','ORIGIN','HANDLING','BLOCKER','GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TagAction" AS ENUM ('ADDED','REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Organisations ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "organizations" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");

-- The clinic this system was built for. A fixed uuid rather than a generated one so the row is the
-- same across every environment — the API resolves the default organisation by slug, but a stable
-- id makes a database restored from one environment into another still make sense.
INSERT INTO "organizations" ("id", "name", "slug")
VALUES ('00000000-0000-4000-8000-000000000001', 'Kerem Clinic', 'kerem-clinic')
ON CONFLICT ("slug") DO NOTHING;

-- ── Tags ────────────────────────────────────────────────────────────────────────────────────────

-- Free-text hex out, palette in. Guarded so a re-run after a partial failure does not fail on the
-- column already being gone.
ALTER TABLE "tags" DROP COLUMN IF EXISTS "color";

ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "color"          "TagColor"    NOT NULL DEFAULT 'SLATE';
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "category"       "TagCategory" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "createdById"    TEXT;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- Any row that somehow exists belongs to the one clinic. The column is then made NOT NULL, which
-- is the point of it — a nullable tenant key is a tenant key that can be forgotten.
UPDATE "tags" SET "organizationId" = '00000000-0000-4000-8000-000000000001' WHERE "organizationId" IS NULL;
ALTER TABLE "tags" ALTER COLUMN "organizationId" SET NOT NULL;

-- Uniqueness moves from global to per-organisation: two clinics both wanting a "VIP" tag is the
-- ordinary case, and a global index makes the second one fail with a conflict it cannot resolve.
DROP INDEX IF EXISTS "tags_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "tags_organizationId_name_key" ON "tags"("organizationId", "name");
CREATE INDEX IF NOT EXISTS "tags_organizationId_category_idx" ON "tags"("organizationId", "category");

DO $$ BEGIN
  ALTER TABLE "tags" ADD CONSTRAINT "tags_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tags" ADD CONSTRAINT "tags_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tags on deals ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "lead_tags" (
  "leadId"       TEXT NOT NULL,
  "tagId"        TEXT NOT NULL,
  "assignedById" TEXT,
  "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("leadId", "tagId")
);

-- The primary key already serves lookups by lead, being leftmost. Filtering the board by tag runs
-- the other way and would otherwise scan the whole join.
CREATE INDEX IF NOT EXISTS "lead_tags_tagId_idx" ON "lead_tags"("tagId");

DO $$ BEGIN
  ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── What was tagged, and what was untagged ──────────────────────────────────────────────────────

-- The join above holds only the present. Removing a tag deletes the row, so "who took the VIP
-- label off this deal the day before it was lost" would have no answer anywhere.
CREATE TABLE IF NOT EXISTS "lead_tag_history" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "leadId"         TEXT NOT NULL,
  "tagId"          TEXT,
  -- Snapshotted: a tag can be renamed or deleted, and "added a tag that no longer exists" records
  -- nothing. Same reason organizationId is stored here rather than reached through the tag.
  "tagName"        TEXT NOT NULL,
  "action"         "TagAction" NOT NULL,
  "userId"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_tag_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lead_tag_history_leadId_createdAt_idx" ON "lead_tag_history"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "lead_tag_history_organizationId_createdAt_idx" ON "lead_tag_history"("organizationId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "lead_tag_history" ADD CONSTRAINT "lead_tag_history_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "lead_tag_history" ADD CONSTRAINT "lead_tag_history_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "lead_tag_history" ADD CONSTRAINT "lead_tag_history_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "lead_tag_history" ADD CONSTRAINT "lead_tag_history_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
