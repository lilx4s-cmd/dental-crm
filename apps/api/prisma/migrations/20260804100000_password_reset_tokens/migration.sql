-- Password-reset links (C-1).
--
-- Hand-authored and idempotent: this runs against the live clinic database. Nothing here touches
-- an existing row — one new table and one new enum value.

-- Postgres cannot use a new enum value in the transaction that adds it. Nothing below does; the
-- value is first written by application code in a later transaction.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  -- Only the hash. The raw token lives in the email and the URL and nowhere else, so a leaked
  -- database read yields nothing redeemable.
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  -- Kept rather than deleted after use, so "already used" can be told apart from "never existed".
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestIp" TEXT,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_key"
  ON "password_reset_tokens" ("tokenHash");

-- Redeeming a link looks the row up by hash; the two below serve revoking a user's outstanding
-- links on a successful reset, and pruning expired ones once there is a scheduler (Phase B).
CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_idx"
  ON "password_reset_tokens" ("userId");

CREATE INDEX IF NOT EXISTS "password_reset_tokens_expiresAt_idx"
  ON "password_reset_tokens" ("expiresAt");

DO $$
BEGIN
  ALTER TABLE "password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
