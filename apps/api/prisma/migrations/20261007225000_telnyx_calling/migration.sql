-- CreateTable
CREATE TABLE "voice_agents" (
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "sipUsername" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_agents_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "voice_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAFF_RINGING',
    "activeUserId" TEXT,
    "staffDestination" TEXT NOT NULL,
    "staffCallId" TEXT,
    "patientCallId" TEXT,
    "patientDialUnconfirmed" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "callLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_webhook_events" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voice_attempts_activeUserId_key" ON "voice_attempts"("activeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "voice_attempts_callLogId_key" ON "voice_attempts"("callLogId");

-- CreateIndex
CREATE INDEX "voice_attempts_userId_createdAt_idx" ON "voice_attempts"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "voice_agents" ADD CONSTRAINT "voice_agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_attempts" ADD CONSTRAINT "voice_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_attempts" ADD CONSTRAINT "voice_attempts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_attempts" ADD CONSTRAINT "voice_attempts_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "call_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

