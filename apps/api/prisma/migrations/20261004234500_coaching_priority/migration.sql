-- AlterTable
ALTER TABLE "coaching_issues" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "coaching_issues_clinicId_status_priority_detectedAt_idx" ON "coaching_issues"("clinicId", "status", "priority", "detectedAt");


CREATE FUNCTION coaching_operational_audit() RETURNS TRIGGER AS $$
DECLARE rowdata JSONB; beforedata JSONB; target TEXT; actor TEXT; message TEXT;
BEGIN
  rowdata := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  beforedata := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  IF TG_TABLE_NAME='payments' AND (TG_OP='INSERT' OR rowdata->>'status' IS DISTINCT FROM beforedata->>'status' OR rowdata->>'amount' IS DISTINCT FROM beforedata->>'amount') THEN
    SELECT p."convertedFromLeadId" INTO target FROM invoices i JOIN patients p ON p.id=i."patientId" WHERE i.id=rowdata->>'invoiceId';
    actor := rowdata->>'createdById'; message := 'Payment record: ' || (rowdata->>'amount') || ' ' || (rowdata->>'currency') || ' · ' || (rowdata->>'status');
  ELSIF TG_TABLE_NAME='appointments' AND (TG_OP='INSERT' OR rowdata->>'status' IS DISTINCT FROM beforedata->>'status' OR rowdata->>'startTime' IS DISTINCT FROM beforedata->>'startTime') THEN
    SELECT "convertedFromLeadId" INTO target FROM patients WHERE id=rowdata->>'patientId';
    actor := rowdata->>'createdById'; message := 'Appointment: ' || (rowdata->>'status') || ' at ' || (rowdata->>'startTime');
  ELSIF TG_TABLE_NAME='files' AND TG_OP='INSERT' THEN
    IF rowdata->>'ownerType'='LEAD' THEN target:=rowdata->>'ownerId'; ELSIF rowdata->>'ownerType'='PATIENT' THEN SELECT "convertedFromLeadId" INTO target FROM patients WHERE id=rowdata->>'ownerId'; END IF;
    actor:=rowdata->>'uploadedById'; message:='Patient file uploaded: ' || (rowdata->>'fileName');
  ELSIF TG_TABLE_NAME='leads' AND TG_OP='UPDATE' AND rowdata->>'assignedToId' IS DISTINCT FROM beforedata->>'assignedToId' THEN
    target:=rowdata->>'id';
    SELECT 'Lead assigned to ' || "firstName" || ' ' || "lastName" INTO message FROM users WHERE id=rowdata->>'assignedToId';
    message:=COALESCE(message,'Lead assignee removed');
  END IF;
  IF target IS NOT NULL AND message IS NOT NULL THEN
    INSERT INTO lead_activities (id,"leadId","userId",note,"createdAt") VALUES (gen_random_uuid()::text,target,actor,message,CURRENT_TIMESTAMP);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER coaching_operational_audit AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION coaching_operational_audit();
CREATE TRIGGER coaching_operational_audit AFTER INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION coaching_operational_audit();
CREATE TRIGGER coaching_operational_audit AFTER INSERT ON files FOR EACH ROW EXECUTE FUNCTION coaching_operational_audit();
CREATE TRIGGER coaching_operational_audit AFTER UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION coaching_operational_audit();
