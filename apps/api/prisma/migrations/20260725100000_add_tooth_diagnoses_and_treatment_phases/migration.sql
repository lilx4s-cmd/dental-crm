-- CreateEnum
CREATE TYPE "ToothCondition" AS ENUM ('HEALTHY', 'CARIES', 'PLAQUE', 'AMALGAM_FILLING', 'COMPOSITE_FILLING', 'MISSING', 'FRACTURED', 'WORN', 'ONLY_ROOT', 'ROOT_CANAL_TREATED', 'MOBILITY', 'RECEDING_BONE', 'CYST', 'EXTRACTION', 'IMPLANT', 'CROWN', 'VENEER', 'BRIDGE', 'FILLING', 'ROOT_CANAL', 'CLEANING', 'BONE_GRAFT', 'SINUS_LIFT');

-- AlterTable
ALTER TABLE "treatment_plan_items" ADD COLUMN     "phaseNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "toothCondition" "ToothCondition";

-- CreateTable
CREATE TABLE "treatment_plan_diagnoses" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "condition" "ToothCondition" NOT NULL,
    "toothNumbers" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plan_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_phases" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "phaseNumber" INTEGER NOT NULL,
    "name" TEXT,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2),
    "healingPeriodMonths" INTEGER,

    CONSTRAINT "treatment_plan_phases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_plan_diagnoses_treatmentPlanId_idx" ON "treatment_plan_diagnoses"("treatmentPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plan_phases_treatmentPlanId_phaseNumber_key" ON "treatment_plan_phases"("treatmentPlanId", "phaseNumber");

-- AddForeignKey
ALTER TABLE "treatment_plan_diagnoses" ADD CONSTRAINT "treatment_plan_diagnoses_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_phases" ADD CONSTRAINT "treatment_plan_phases_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
