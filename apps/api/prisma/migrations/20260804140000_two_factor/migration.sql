-- TOTP second factor and self-service account security (C-3).
--
-- Hand-authored and idempotent; runs against the live clinic database. Both new user columns are
-- nullable with no default, so every existing row is untouched and nobody's sign-in changes until
-- they enrol themselves.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_DISABLED';

-- Encrypted at rest, not the raw base32 secret — a leaked database read must not hand over the
-- second factor alongside the first.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
-- A timestamp rather than a boolean: when someone turned 2FA on is a fact worth keeping, and
-- "enabled" is derivable from it.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabledAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "two_factor_recovery_codes" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  -- Hashed like a password: possession of one is enough to bypass the second factor.
  "codeHash"  TEXT NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "two_factor_recovery_codes_userId_idx"
  ON "two_factor_recovery_codes" ("userId");

DO $$
BEGIN
  ALTER TABLE "two_factor_recovery_codes"
    ADD CONSTRAINT "two_factor_recovery_codes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
