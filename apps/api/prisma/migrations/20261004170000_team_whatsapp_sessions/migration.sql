CREATE TABLE "whatsapp_accounts" (
  "sessionId" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "linkedNumber" TEXT,
  "autoReconnect" BOOLEAN NOT NULL DEFAULT false,
  "connectedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("sessionId"),
  CONSTRAINT "whatsapp_accounts_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "whatsapp_accounts_ownerUserId_key" ON "whatsapp_accounts"("ownerUserId");
ALTER TABLE "conversations" ADD COLUMN "whatsappSessionId" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX "conversations_whatsappSessionId_externalThreadId_idx" ON "conversations"("whatsappSessionId", "externalThreadId");
