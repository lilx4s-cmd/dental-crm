-- Account lockout after repeated failed sign-ins (C-6).
--
-- Hand-authored and idempotent because this runs against the live clinic database. Nothing here
-- rewrites an existing row: both columns take defaults, so the 1,000-odd rows already in `users`
-- are untouched and every account starts unlocked with a zero counter.

-- Postgres cannot use a new enum value in the same transaction that adds it. Nothing below does,
-- and the values are first written by application code in a later transaction.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOCKOUT';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
