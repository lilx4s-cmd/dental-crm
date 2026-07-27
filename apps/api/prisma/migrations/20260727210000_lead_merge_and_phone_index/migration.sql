-- Duplicate deals are folded into one another rather than deleted.
--
-- A quarter of the live pipeline is the same person entered more than once — 166 numbers across
-- 416 deals — mostly re-enquiries and the Bitrix import running twice. Deleting the extras would
-- throw away the notes, tasks and stage history somebody wrote against them, and there would be no
-- way to tell afterwards whether a deal had ever existed. The row stays, points at the deal it was
-- folded into, and drops out of the board.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMP(3);

-- ON DELETE SET NULL: if a survivor is ever removed, the deals folded into it come back into view
-- rather than vanishing behind a dangling pointer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_mergedIntoId_fkey'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_mergedIntoId_fkey"
      FOREIGN KEY ("mergedIntoId") REFERENCES "leads"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "leads_mergedIntoId_idx" ON "leads"("mergedIntoId");

-- Every board query now filters merged deals out, and the duplicate check looks a number up on
-- every create. Both are hot paths on a table that only had indexes for stage and assignee.
CREATE INDEX IF NOT EXISTS "leads_phone_idx" ON "leads"("phone");
CREATE INDEX IF NOT EXISTS "leads_whatsappNumber_idx" ON "leads"("whatsappNumber");
