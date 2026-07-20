-- CreateEnum
CREATE TYPE "PatientApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'VOIDED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "TimelineStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CommentAuthorType" AS ENUM ('STAFF', 'PATIENT');

-- AlterEnum
ALTER TYPE "AttachableType" ADD VALUE 'TREATMENT_PLAN_ITEM';
ALTER TYPE "AttachableType" ADD VALUE 'WARRANTY';

-- AlterEnum
ALTER TYPE "FileCategory" ADD VALUE 'BEFORE_PHOTO';
ALTER TYPE "FileCategory" ADD VALUE 'AFTER_PHOTO';
ALTER TYPE "FileCategory" ADD VALUE 'WARRANTY_PDF';

-- AlterTable
ALTER TABLE "treatment_plan_items" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "clinicalNotes" TEXT,
ADD COLUMN     "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "material" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "treatment_plans" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "approvalStatus" "PatientApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "assignedCoordinatorId" TEXT,
ADD COLUMN     "assignedDentistId" TEXT,
ADD COLUMN     "diagnosisSnapshot" TEXT,
ADD COLUMN     "doctorRecommendation" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "warranty_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "treatmentCategoryId" TEXT,
    "durationMonths" INTEGER NOT NULL,
    "termsAndConditions" TEXT NOT NULL,
    "maintenanceRequirements" TEXT,
    "exclusions" TEXT,
    "annualCheckupRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" TEXT NOT NULL,
    "treatmentPlanItemId" TEXT NOT NULL,
    "warrantyTemplateId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'ACTIVE',
    "termsAndConditions" TEXT NOT NULL,
    "maintenanceRequirements" TEXT,
    "exclusions" TEXT,
    "annualCheckupRequired" BOOLEAN NOT NULL,
    "certificateFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_timeline_steps" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TimelineStepStatus" NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_timeline_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_comments" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "authorType" "CommentAuthorType" NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plan_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_share_links" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plan_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranty_templates_name_key" ON "warranty_templates"("name");

-- CreateIndex
CREATE INDEX "warranties_treatmentPlanItemId_idx" ON "warranties"("treatmentPlanItemId");

-- CreateIndex
CREATE INDEX "treatment_timeline_steps_treatmentPlanId_idx" ON "treatment_timeline_steps"("treatmentPlanId");

-- CreateIndex
CREATE INDEX "treatment_plan_comments_treatmentPlanId_idx" ON "treatment_plan_comments"("treatmentPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plan_share_links_tokenHash_key" ON "treatment_plan_share_links"("tokenHash");

-- CreateIndex
CREATE INDEX "treatment_plan_share_links_treatmentPlanId_idx" ON "treatment_plan_share_links"("treatmentPlanId");

-- CreateIndex
CREATE INDEX "treatment_plans_assignedDentistId_idx" ON "treatment_plans"("assignedDentistId");

-- CreateIndex
CREATE INDEX "treatment_plans_assignedCoordinatorId_idx" ON "treatment_plans"("assignedCoordinatorId");

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_assignedDentistId_fkey" FOREIGN KEY ("assignedDentistId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_assignedCoordinatorId_fkey" FOREIGN KEY ("assignedCoordinatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_templates" ADD CONSTRAINT "warranty_templates_treatmentCategoryId_fkey" FOREIGN KEY ("treatmentCategoryId") REFERENCES "treatment_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_treatmentPlanItemId_fkey" FOREIGN KEY ("treatmentPlanItemId") REFERENCES "treatment_plan_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_warrantyTemplateId_fkey" FOREIGN KEY ("warrantyTemplateId") REFERENCES "warranty_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_timeline_steps" ADD CONSTRAINT "treatment_timeline_steps_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_comments" ADD CONSTRAINT "treatment_plan_comments_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_comments" ADD CONSTRAINT "treatment_plan_comments_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_share_links" ADD CONSTRAINT "treatment_plan_share_links_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_share_links" ADD CONSTRAINT "treatment_plan_share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
