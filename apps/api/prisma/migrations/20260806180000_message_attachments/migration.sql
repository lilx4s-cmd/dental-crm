-- Files sent in a conversation.
--
-- Hand-authored and idempotent; runs against a live database holding real patient records.

-- ── Enum extensions ─────────────────────────────────────────────────────────────────────────────
--
-- Postgres cannot add an enum value inside a transaction that then uses it, and re-adding one
-- errors, so both are guarded. `IF NOT EXISTS` is supported from Postgres 12; Supabase is well
-- past that.

ALTER TYPE "AttachableType" ADD VALUE IF NOT EXISTS 'CONVERSATION';
ALTER TYPE "FileCategory"   ADD VALUE IF NOT EXISTS 'MESSAGE_ATTACHMENT';

DO $$ BEGIN
  CREATE TYPE "FileScanStatus" AS ENUM ('PENDING','CLEAN','INFECTED','SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Scan state on every file ────────────────────────────────────────────────────────────────────
--
-- Defaults to SKIPPED, not CLEAN. No scanner is configured today, and "nothing scanned it" is a
-- different fact from "something scanned it and it was fine". Existing rows take the default,
-- which is the honest description of them.

ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'SKIPPED';
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3);

-- ── The join ────────────────────────────────────────────────────────────────────────────────────
--
-- One message can carry several files: the quote, the itinerary and the hotel photo go together,
-- and sending three messages for that is three notifications on the patient's phone.

CREATE TABLE IF NOT EXISTS "message_attachments" (
  "messageId" TEXT NOT NULL,
  "fileId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("messageId", "fileId")
);

-- The primary key serves lookups by message. The patient's document library goes the other way —
-- "which message was this file sent with" — and would otherwise scan.
CREATE INDEX IF NOT EXISTS "message_attachments_fileId_idx" ON "message_attachments"("fileId");

DO $$ BEGIN
  ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cascade on the file too: a file genuinely deleted from storage should not leave a link to
-- nothing. Note this is the *file* being deleted, not the message — deleting a message takes the
-- link and leaves the file, which stays on the conversation and in the patient's library.
DO $$ BEGIN
  ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
