-- Indexes for "the last thing this patient said", shown on every board card.
--
-- `conversations` carried only an index on `channel`. Reading each deal's most recent thread was
-- therefore a sequential scan per card — tolerable while nothing asked for it, and a board that
-- takes seconds to paint the moment something does.
--
-- Both columns are nullable and both are leading: Postgres uses a btree for `WHERE leadId = $1`
-- and the trailing `lastMessageAt` lets the ORDER BY ... LIMIT 1 be an index scan rather than a
-- sort of the whole thread list.
CREATE INDEX IF NOT EXISTS "conversations_leadId_lastMessageAt_idx"
  ON "conversations"("leadId", "lastMessageAt");

CREATE INDEX IF NOT EXISTS "conversations_patientId_lastMessageAt_idx"
  ON "conversations"("patientId", "lastMessageAt");
