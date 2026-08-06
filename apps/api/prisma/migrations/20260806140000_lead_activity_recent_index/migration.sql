-- "The newest activity on each deal", which the board draws on every card.
--
-- Prisma's `distinct` compiles to Postgres DISTINCT ON, and DISTINCT ON is only cheap when the
-- sort it needs is the index order. `lead_activities(leadId)` alone gives the planner the right
-- rows but leaves it sorting them; with createdAt trailing leadId the newest row per deal is the
-- first one the scan meets.
--
-- Supports the board's DISTINCT ON over 735 open deals. The gain is modest today because the table
-- holds only ~156 activities; it is here because that table grows with every stage change, note
-- and reassignment, and this query runs on every board load.
CREATE INDEX IF NOT EXISTS "lead_activities_leadId_createdAt_idx"
  ON "lead_activities"("leadId", "createdAt");
