-- CreateTable
CREATE TABLE "intake_submissions" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "whatsappNumber" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "nationality" TEXT,
    "countryOfResidence" TEXT,
    "preferredLanguage" TEXT,
    "treatmentInterest" TEXT[],
    "chiefComplaint" TEXT,
    "desiredTimeframe" TEXT,
    "openToTravel" BOOLEAN,
    "allergies" TEXT,
    "medications" TEXT,
    "medicalConditions" TEXT,
    "previousSurgeries" TEXT,
    "isSmoker" BOOLEAN,
    "drinksAlcohol" BOOLEAN,
    "isPregnant" BOOLEAN,
    "takesBloodThinners" BOOLEAN,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "additionalNotes" TEXT,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "consentText" TEXT NOT NULL,
    "uploadTokenHash" TEXT,
    "sourceUrl" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_attachments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intake_submissions_leadId_idx" ON "intake_submissions"("leadId");

-- CreateIndex
CREATE INDEX "intake_attachments_submissionId_idx" ON "intake_attachments"("submissionId");

-- AddForeignKey
ALTER TABLE "intake_submissions" ADD CONSTRAINT "intake_submissions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_submissions" ADD CONSTRAINT "intake_submissions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_attachments" ADD CONSTRAINT "intake_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "intake_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
