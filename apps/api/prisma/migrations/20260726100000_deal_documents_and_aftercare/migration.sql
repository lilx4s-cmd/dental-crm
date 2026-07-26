-- Travel paperwork the clinic collects once a deal reaches the ticket stage.
-- Postgres runs ALTER TYPE ... ADD VALUE outside the surrounding transaction, which is why these
-- are plain additions rather than a type rebuild — nothing is being removed here.
ALTER TYPE "FileCategory" ADD VALUE 'PASSPORT';
ALTER TYPE "FileCategory" ADD VALUE 'FLIGHT_TICKET';

-- When the deal that produced a patient reaches Done, treatment is finished and the relationship
-- moves from selling to after-care. Stored as a date rather than a flag because how long somebody
-- has been in after-care is what drives the follow-up schedule.
ALTER TABLE "patients" ADD COLUMN "aftercareStartedAt" TIMESTAMP(3);
