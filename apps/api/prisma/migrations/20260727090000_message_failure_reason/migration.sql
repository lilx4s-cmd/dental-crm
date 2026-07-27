-- A message that could not be handed to WhatsApp is recorded as FAILED, and the reason is kept
-- alongside it. Without this, staff see a message sitting there and have no way to tell whether
-- the patient never received it, or why — which on a clinical follow-up is the difference between
-- "they are ignoring us" and "our gateway is down".
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
