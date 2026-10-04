-- CreateTable
CREATE TABLE "first_contact_observations" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "contactedAt" TIMESTAMP(3),
    "responseSeconds" INTEGER,
    "slaSeconds" INTEGER NOT NULL,

    CONSTRAINT "first_contact_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "first_contact_observations_assignedUserId_assignedAt_idx" ON "first_contact_observations"("assignedUserId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "first_contact_observations_leadId_assignedAt_key" ON "first_contact_observations"("leadId", "assignedAt");

-- AddForeignKey
ALTER TABLE "first_contact_observations" ADD CONSTRAINT "first_contact_observations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Freeze assignment and SLA history when the event occurs, even if a worker is briefly down.
CREATE FUNCTION coaching_first_contact_clock() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."assignedToId" IS NOT NULL AND (TG_OP='INSERT' OR NEW."assignedToId" IS DISTINCT FROM OLD."assignedToId") THEN
    INSERT INTO first_contact_observations (id,"leadId","assignedUserId","assignedAt","slaSeconds") VALUES (gen_random_uuid()::text,NEW.id,NEW."assignedToId",NEW."assignedAt",COALESCE((SELECT "thresholdMinutes"*60 FROM sales_rules WHERE "clinicId"='singleton' AND key='NEW_LEAD_NOT_CONTACTED'),300)) ON CONFLICT ("leadId","assignedAt") DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER coaching_first_contact_clock AFTER INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION coaching_first_contact_clock();
CREATE FUNCTION coaching_reply_clock() RETURNS TRIGGER AS $$
DECLARE linked TEXT; agent TEXT; assignment TIMESTAMP;
BEGIN
  IF NEW.direction='INBOUND' THEN
    SELECT l.id,l."assignedToId",l."assignedAt" INTO linked,agent,assignment FROM conversations c LEFT JOIN patients p ON p.id=c."patientId" JOIN leads l ON l.id=COALESCE(c."leadId",p."convertedFromLeadId") WHERE c.id=NEW."conversationId";
    IF linked IS NOT NULL AND NEW."createdAt">=assignment THEN
      INSERT INTO response_observations (id,"leadId","inboundMessageId","assignedUserId","inboundAt","slaSeconds","createdAt") VALUES (gen_random_uuid()::text,linked,NEW.id,agent,NEW."createdAt",COALESCE((SELECT "thresholdMinutes"*60 FROM sales_rules WHERE "clinicId"='singleton' AND key='PATIENT_WAITING_REPLY'),600),CURRENT_TIMESTAMP) ON CONFLICT ("inboundMessageId") DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER coaching_reply_clock AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION coaching_reply_clock();
