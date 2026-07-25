-- CreateTable
CREATE TABLE "treatment_plan_stays" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3),
    "arrivalFlight" TEXT,
    "departureDate" TIMESTAMP(3),
    "departureFlight" TEXT,
    "hotelName" TEXT,
    "hotelAddress" TEXT,
    "roomType" TEXT,
    "nights" INTEGER,
    "companions" INTEGER,
    "checkInDate" TIMESTAMP(3),
    "checkOutDate" TIMESTAMP(3),
    "airportTransfer" TEXT,
    "clinicTransfer" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plan_stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_schedule_items" (
    "id" TEXT NOT NULL,
    "treatmentPlanId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plan_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plan_stays_treatmentPlanId_key" ON "treatment_plan_stays"("treatmentPlanId");

-- CreateIndex
CREATE INDEX "treatment_plan_schedule_items_treatmentPlanId_idx" ON "treatment_plan_schedule_items"("treatmentPlanId");

-- AddForeignKey
ALTER TABLE "treatment_plan_stays" ADD CONSTRAINT "treatment_plan_stays_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_schedule_items" ADD CONSTRAINT "treatment_plan_schedule_items_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
