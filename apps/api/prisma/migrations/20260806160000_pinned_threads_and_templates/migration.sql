-- Pinned threads, and canned replies.
--
-- Hand-authored and idempotent: this runs against a live database.

-- ── Pinning ─────────────────────────────────────────────────────────────────────────────────────
--
-- Clinic-wide rather than per user. A pinned thread means "everyone should be able to find this
-- one" — the patient flying in on Thursday, the complaint being handled — not "I am working on
-- it", which assignment already records. A per-user pin would need its own join table and would
-- hide the urgent thread from whoever is covering.

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);

-- The inbox's own ordering, in one index: unarchived, pinned first, most recently spoken.
CREATE INDEX IF NOT EXISTS "conversations_isArchived_isPinned_lastMessageAt_idx"
  ON "conversations"("isArchived", "isPinned", "lastMessageAt");

-- ── Canned replies ──────────────────────────────────────────────────────────────────────────────
--
-- Not Meta's "message templates", which are pre-approved formats for opening a conversation
-- outside the 24-hour window and carry an approval workflow this does not model.
-- `messages.templateName` already records when one of those was used. These are text snippets
-- staff insert into a reply they are about to send.

CREATE TABLE IF NOT EXISTS "message_templates" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "category"       TEXT,
  -- Deactivated rather than deleted, so dropping one from the picker does not erase the record of
  -- who used it, and undoing a mistake does not need it re-typed.
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdById"    TEXT,
  "useCount"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_templates_organizationId_title_key"
  ON "message_templates"("organizationId", "title");
CREATE INDEX IF NOT EXISTS "message_templates_organizationId_isActive_idx"
  ON "message_templates"("organizationId", "isActive");

DO $$ BEGIN
  ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
