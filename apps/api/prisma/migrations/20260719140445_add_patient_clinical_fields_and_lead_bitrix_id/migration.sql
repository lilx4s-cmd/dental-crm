-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "diagnosis" TEXT,
ADD COLUMN     "insuranceInfo" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "bitrixDealId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "leads_bitrixDealId_key" ON "leads"("bitrixDealId");
