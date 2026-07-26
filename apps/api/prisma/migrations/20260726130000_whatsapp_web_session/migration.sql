-- Session credentials for a linked WhatsApp Web number.
--
-- Stored in Postgres rather than on disk: Render's filesystem is ephemeral, so a deploy would
-- otherwise drop the session and force somebody to physically re-scan the QR — the kind of failure
-- nobody notices until a patient says nobody replied.
--
-- Key-value rather than typed columns because Baileys keeps its state as many small keyed blobs:
-- the credentials themselves plus per-device pre-key and session records.
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT 'default',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_sessions_sessionId_idx" ON "whatsapp_sessions"("sessionId");

CREATE UNIQUE INDEX "whatsapp_sessions_sessionId_key_key" ON "whatsapp_sessions"("sessionId", "key");
