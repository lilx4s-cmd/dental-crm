-- Replaces the generic pipeline stages with the clinic's own sales process.
--
-- Postgres cannot drop a value from an enum in place, so the type is rebuilt and every dependent
-- column is converted through an explicit mapping. Three columns use it: leads.stage and both
-- lead_activities.fromStage / toStage — the history columns are converted too, otherwise past
-- stage changes would reference values the type no longer has.
--
-- Mapping, against the 1005 records live at the time of writing:
--   NEW_LEAD (811)               -> NEW_DEAL
--   CONTACTED (82)               -> CONTACTED
--   QUALIFIED (8)                -> CONTACTED       (spoken to and real, which is what Contacted means now)
--   CONSULTATION_SCHEDULED (1)   -> CONSULTATION
--   CONSULTATION_DONE (10)       -> CONSULTATION
--   TREATMENT_PROPOSED (9)       -> OFFER_SENT
--   NEGOTIATION (48)             -> NEGOTIATION
--   WON (19)                     -> DONE
--   LOST (17)                    -> LOST
--
-- Nothing is dropped: every old value lands somewhere, so no deal loses its place in the board.

-- CreateEnum
CREATE TYPE "PipelineStage_new" AS ENUM (
  'NEW_DEAL',
  'NO_RESPONSE_1',
  'NO_RESPONSE_2',
  'NO_RESPONSE_3',
  'CONTACTED',
  'WAITING_PHOTOS',
  'CONSULTATION',
  'OFFER_SENT',
  'NEGOTIATION',
  'WAITING_FOR_TICKET',
  'TICKET',
  'SECOND_VISIT',
  'DONE',
  'LOST'
);

-- The default references the old type, so it has to go before the column can be retyped.
ALTER TABLE "leads" ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "leads"
  ALTER COLUMN "stage" TYPE "PipelineStage_new"
  USING (
    CASE "stage"::text
      WHEN 'NEW_LEAD' THEN 'NEW_DEAL'
      WHEN 'QUALIFIED' THEN 'CONTACTED'
      WHEN 'CONSULTATION_SCHEDULED' THEN 'CONSULTATION'
      WHEN 'CONSULTATION_DONE' THEN 'CONSULTATION'
      WHEN 'TREATMENT_PROPOSED' THEN 'OFFER_SENT'
      WHEN 'WON' THEN 'DONE'
      ELSE "stage"::text
    END
  )::"PipelineStage_new";

ALTER TABLE "lead_activities"
  ALTER COLUMN "fromStage" TYPE "PipelineStage_new"
  USING (
    CASE "fromStage"::text
      WHEN 'NEW_LEAD' THEN 'NEW_DEAL'
      WHEN 'QUALIFIED' THEN 'CONTACTED'
      WHEN 'CONSULTATION_SCHEDULED' THEN 'CONSULTATION'
      WHEN 'CONSULTATION_DONE' THEN 'CONSULTATION'
      WHEN 'TREATMENT_PROPOSED' THEN 'OFFER_SENT'
      WHEN 'WON' THEN 'DONE'
      ELSE "fromStage"::text
    END
  )::"PipelineStage_new";

ALTER TABLE "lead_activities"
  ALTER COLUMN "toStage" TYPE "PipelineStage_new"
  USING (
    CASE "toStage"::text
      WHEN 'NEW_LEAD' THEN 'NEW_DEAL'
      WHEN 'QUALIFIED' THEN 'CONTACTED'
      WHEN 'CONSULTATION_SCHEDULED' THEN 'CONSULTATION'
      WHEN 'CONSULTATION_DONE' THEN 'CONSULTATION'
      WHEN 'TREATMENT_PROPOSED' THEN 'OFFER_SENT'
      WHEN 'WON' THEN 'DONE'
      ELSE "toStage"::text
    END
  )::"PipelineStage_new";

DROP TYPE "PipelineStage";
ALTER TYPE "PipelineStage_new" RENAME TO "PipelineStage";

ALTER TABLE "leads" ALTER COLUMN "stage" SET DEFAULT 'NEW_DEAL';
