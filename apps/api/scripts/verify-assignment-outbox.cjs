const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const assert=require('node:assert/strict');
async function main(){const db=new PGlite();try{
 await db.exec(`CREATE TABLE lead_activities(id TEXT PRIMARY KEY); CREATE TABLE files(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE clinic_settings(id TEXT PRIMARY KEY); CREATE TABLE leads(id TEXT PRIMARY KEY,"assignedToId" TEXT REFERENCES users(id)); INSERT INTO users VALUES ('seller-a'),('seller-b'); CREATE TABLE patients(id TEXT PRIMARY KEY,"convertedFromLeadId" TEXT); CREATE TABLE treatment_plans(id TEXT PRIMARY KEY,"approvalStatus" TEXT); CREATE TABLE invoices(id TEXT PRIMARY KEY,"patientId" TEXT); CREATE TABLE payments(id TEXT PRIMARY KEY,"invoiceId" TEXT); CREATE TABLE warranties(id TEXT PRIMARY KEY); CREATE TABLE warranty_templates(id TEXT PRIMARY KEY); CREATE TABLE treatment_plan_items(id TEXT PRIMARY KEY);`);
 for(const migration of ['20261005120000_consultation_documents','20261005160000_staff_alerts','20261005190000_travel_finance'])await db.exec(readFileSync(join(__dirname,'../prisma/migrations',migration,'migration.sql'),'utf8'));
 await db.exec(`INSERT INTO leads(id,"assignedToId") VALUES ('manual','seller-a'),('website',NULL); UPDATE leads SET "assignedToId"='seller-a' WHERE id='manual';`);
 assert.equal((await db.query(`SELECT * FROM lead_assignment_events`)).rows.length,2);
 await db.exec(`INSERT INTO staff_alerts(id,"eventId","userId",kind,channel,"dedupeKey") SELECT 'alert',id,'seller-a','ASSIGNMENT','WHATSAPP','event-a' FROM lead_assignment_events WHERE "leadId"='manual'; UPDATE leads SET "assignedToId"='seller-b' WHERE id='manual';`);
 assert.equal((await db.query(`SELECT state FROM staff_alerts WHERE id='alert'`)).rows[0].state,'CANCELLED');
 assert.equal((await db.query(`SELECT * FROM lead_assignment_events WHERE "leadId"='manual' AND "closedAt" IS NULL`)).rows.length,1);
 await db.exec(`BEGIN; INSERT INTO leads(id,"assignedToId") VALUES ('rolled-back','seller-a'); ROLLBACK;`);
 assert.equal((await db.query(`SELECT * FROM lead_assignment_events WHERE "leadId"='rolled-back'`)).rows.length,0);
 await assert.rejects(db.exec(`INSERT INTO staff_alerts(id,"userId",kind,channel,"dedupeKey") VALUES ('dup','seller-a','ASSIGNMENT','WHATSAPP','event-a')`));
 await db.exec(`INSERT INTO patients(id) VALUES ('patient'); INSERT INTO treatment_plans(id) VALUES ('plan'); INSERT INTO document_versions(id,kind,"sourceId",version,"patientId","treatmentPlanId",language,"createdById",snapshot,"pdfData","verificationHash") VALUES ('v1','PLAN','plan',1,'patient','plan','ar','seller-a','{"quote":350}',decode('25504446','hex'),'hash1'); UPDATE treatment_plans SET consultation='{"revised":true}' WHERE id='plan';`);
 assert.equal((await db.query(`SELECT encode("pdfData",'hex') AS bytes,snapshot FROM document_versions WHERE id='v1'`)).rows[0].bytes,'25504446');
 await assert.rejects(db.exec(`INSERT INTO document_versions(id,kind,"sourceId",version,"patientId",language,"createdById",snapshot,"pdfData","verificationHash") VALUES ('duplicate','PLAN','plan',1,'patient','en','seller-a','{}',decode('25','hex'),'hash2')`));
 console.log('outbox checks passed: committed assignment events, rollback isolation, deduplication, stale cancellation, document migrations and immutable stored bytes');
 }finally{await db.close();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
