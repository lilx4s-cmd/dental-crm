-- Unread tracking for the inbox.
--
-- Message.readAt already existed but means the opposite thing: it is WhatsApp's delivery receipt,
-- the *patient* having read us. Nothing recorded staff reading the patient, so an inbox of forty
-- threads gave no indication which needed an answer — the one question it is opened to answer.
--
-- Nullable with no default, so every existing conversation starts "never read". That is the honest
-- initial state: defaulting to now() would silently declare an existing backlog handled.

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);

-- Counting unread filters a conversation's messages by direction and time. Without this it is a
-- scan per conversation on every inbox load.
CREATE INDEX IF NOT EXISTS "messages_conversationId_direction_createdAt_idx"
  ON "messages" ("conversationId", "direction", "createdAt");
