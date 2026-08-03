-- Indexes for the audit trail (C-2).
--
-- Until now `audit_logs` held two rows per session — a login and a logout — and the single index
-- on (entityType, entityId) was plenty. With the audit interceptor writing a row per clinical and
-- financial mutation this becomes the fastest-growing table in the database, and the two questions
-- anyone actually asks of an audit trail were both sequential scans:
--   "what did this person do"   -> (userId, createdAt)
--   "what happened on this day" -> (createdAt)
--
-- Built plainly rather than CONCURRENTLY: Prisma sends a migration file as one statement batch,
-- which Postgres runs in an implicit transaction, and CREATE INDEX CONCURRENTLY is rejected
-- inside one. The brief write lock is irrelevant at the table's current size — it holds a few
-- hundred rows today. If this table is ever large enough for the lock to matter, build the index
-- by hand outside a transaction instead of changing this file.

CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx"
  ON "audit_logs" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx"
  ON "audit_logs" ("createdAt");
