-- AlterTable
-- Backfilled to updatedAt rather than now() so existing leads do not all look freshly moved:
-- seeding every row with the migration timestamp would hide genuinely stale leads from the
-- "no movement" filter for the first two weeks after deploy.
ALTER TABLE "leads" ADD COLUMN     "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "leads" SET "stageChangedAt" = "updatedAt";

-- CreateTable
CREATE TABLE "lead_tasks" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_stageChangedAt_idx" ON "leads"("stageChangedAt");

-- CreateIndex
CREATE INDEX "lead_tasks_leadId_idx" ON "lead_tasks"("leadId");

-- CreateIndex
CREATE INDEX "lead_tasks_dueDate_idx" ON "lead_tasks"("dueDate");

-- CreateIndex
CREATE INDEX "lead_tasks_assignedToId_idx" ON "lead_tasks"("assignedToId");

-- AddForeignKey
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
