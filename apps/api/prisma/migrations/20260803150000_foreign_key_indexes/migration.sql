-- Indexes on foreign keys Postgres does not create for you (P-3).
--
-- Postgres indexes a primary key and a unique constraint automatically; it does *not* index the
-- referencing side of a foreign key. Prisma does not add them either. So every one of the columns
-- below was a sequential scan.
--
-- Honest about scale: these tables are small today — 6 treatment plan items, 0 campaigns, 0
-- patient tags. None of this fixes a problem anyone is currently feeling. It is cheap insurance
-- taken while the tables are small enough for the index build to be instant, on access paths that
-- only ever grow.
--
-- Two claims in PROJECT_MASTER_PLAN.md were wrong and are not acted on here: `Tag.name` is already
-- indexed by its @unique, and `Lead.campaignId` already has an explicit @@index. Neither needed
-- anything.

-- Every plan detail view, every dossier render, and the warranties lookup that walks
-- item -> plan -> patient filter on this.
CREATE INDEX IF NOT EXISTS "treatment_plan_items_treatmentPlanId_idx"
  ON "treatment_plan_items" ("treatmentPlanId");

CREATE INDEX IF NOT EXISTS "treatment_plan_items_treatmentCategoryId_idx"
  ON "treatment_plan_items" ("treatmentCategoryId");

-- The composite primary key (patientId, tagId) already serves lookups by patientId, being the
-- leftmost column — but not by tagId alone, which is the direction the patient list filters in.
CREATE INDEX IF NOT EXISTS "patient_tags_tagId_idx"
  ON "patient_tags" ("tagId");

-- externalId is read on every inbound Meta lead-ad webhook: an unauthenticated external path, and
-- so the one place here where a sequential scan is someone else's to trigger.
CREATE INDEX IF NOT EXISTS "campaigns_externalId_idx"
  ON "campaigns" ("externalId");

CREATE INDEX IF NOT EXISTS "campaigns_name_idx"
  ON "campaigns" ("name");
