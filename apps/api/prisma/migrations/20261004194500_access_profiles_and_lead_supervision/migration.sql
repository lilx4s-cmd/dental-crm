-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accessProfileId" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "supervisorId" TEXT;

-- CreateTable
CREATE TABLE "access_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_reviews" (
    "taskId" TEXT,
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "correction" TEXT,
    "submittedById" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_profiles_name_key" ON "access_profiles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "lead_reviews_taskId_key" ON "lead_reviews"("taskId");

-- CreateIndex
CREATE INDEX "lead_reviews_leadId_status_idx" ON "lead_reviews"("leadId", "status");

-- CreateIndex
CREATE INDEX "lead_reviews_status_dueAt_idx" ON "lead_reviews"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_accessProfileId_fkey" FOREIGN KEY ("accessProfileId") REFERENCES "access_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_reviews" ADD CONSTRAINT "lead_reviews_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "lead_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_reviews" ADD CONSTRAINT "lead_reviews_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_reviews" ADD CONSTRAINT "lead_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

