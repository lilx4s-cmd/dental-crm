ALTER TABLE "voice_attempts"
  ADD COLUMN "recordingStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "recordingConsentAt" TIMESTAMP(3);
