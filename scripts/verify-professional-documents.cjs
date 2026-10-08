const fs=require('fs');const ts=require('typescript');const path=require('path');
const root=process.cwd(); fs.mkdirSync('tmp/pdfs',{recursive:true});
for(const name of ['document-presentation','consultation-pdf']){
 let source=fs.readFileSync(`apps/api/src/documents/${name}.ts`,'utf8').replace("'./document-presentation'","'./document-presentation.mjs'");
 let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 // The source's assets resolve from the repository fallback paths.
 if(name==='consultation-pdf')code=code.replace("const el = React.createElement;","const __dirname = "+JSON.stringify(path.join(root,'apps/api/src/documents'))+";\nconst el = React.createElement;");
 fs.writeFileSync(`tmp/pdfs/${name}.mjs`,code);
}
for(const name of ['dental-chart-pdf','patient-proposal-document']){
 const source=fs.readFileSync(`apps/api/src/pdf/${name}.ts`,'utf8').replace("'./dental-chart-pdf'","'./dental-chart-pdf.mjs'");
 let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 if(name==='patient-proposal-document')code="const __dirname = "+JSON.stringify(path.join(root,'apps/api/src/pdf'))+";\n"+code;
 fs.writeFileSync(`tmp/pdfs/${name}.mjs`,code);
}

(async()=>{
const {writeFileSync}=fs;
const {renderConsultationPdf}=await import(require('node:url').pathToFileURL(path.join(root,'tmp/pdfs/consultation-pdf.mjs')));
const shared=require('@dental-crm/shared');
const {ConsultationSchema,DocumentConfigurationSchema}=shared;
const config=DocumentConfigurationSchema.parse({billingLegalName:'Example Dental Clinic Ltd.',billingTaxId:'EXAMPLE - NOT A REAL TAX ID',invoicePaymentInstructions:'Payment by the agreed method. Use the invoice number as your payment reference.',representative:'Example Coordinator'});
const plan=ConsultationSchema.parse({version:1,language:'en',currency:'USD',treatmentText:'12 implants and 24 implant-supported crowns across two visits',lines:[{id:'implant',type:'implant',quantity:12,unitPrice:350,visit:1,positions:['11','13','15','21','23','25','31','33','35','41','43','45'],brand:'Example implant brand',material:'Titanium'},{id:'crown',type:'implantCrown',quantity:24,unitPrice:120,visit:2,positions:[],brand:'Dental Direkt',material:'Zirconia'}],visits:[{number:1,nights:5,hotelRate:60,hotelIncluded:true,transfer:'included',transferPrice:0,itinerary:[]},{number:2,nights:7,hotelRate:60,hotelIncluded:true,transfer:'included',transferPrice:0,itinerary:[]}],healing:{minMonths:3,maxMonths:4},findings:{},includedServices:['Hotel nights as listed','Airport and clinic transfers']});
const invoice={invoiceNumber:'INV-EXAMPLE-001',status:'PARTIALLY_PAID',currency:'USD',issuedAt:'2026-10-08',dueDate:'2026-10-20',subtotal:7080,discount:80,tax:0,total:7000,items:[{description:'Visit 1 - 12 dental implants',quantity:12,unitPrice:350,total:4200},{description:'Visit 2 - 24 implant-supported zirconia crowns',quantity:24,unitPrice:120,total:2880}],payments:[{amount:1000,status:'COMPLETED',currency:'USD',method:'BANK_TRANSFER',paidAt:'2026-10-08',reference:'EXAMPLE PAYMENT'}]};
const context={patient:{id:'example',firstName:'Example',lastName:'Patient',email:'example@example.org',phone:'+12025550100'},clinic:{clinicName:'Example Dental Clinic',address:'Example clinic address',city:'Istanbul',country:'Türkiye',email:'clinic@example.org',website:'example.org'},config,plan,generatedAt:'2026-10-08T00:00:00Z',documentId:'EXAMPLE-PREVIEW',version:1,payment:{terms:'Visit payments are agreed separately before travel.',cardFee:16,cashDiscount:0}};
for(const lang of shared.DOCUMENT_LANGUAGES)for(const kind of ['PLAN','INVOICE']){
 if(kind==='PLAN' && !['en','ar'].includes(lang))continue;
 const input={...context,plan:{...plan,language:lang},kind,...(kind==='INVOICE'?{invoice}:{}),patient:lang==='ar'?{...context.patient,firstName:'مريض',lastName:'مثال'}:context.patient};
 const output=`tmp/pdfs/${kind.toLowerCase()}-${lang}.pdf`;writeFileSync(output,await renderConsultationPdf(input));console.log(output);
}

const longInvoice={...invoice,items:Array.from({length:35},(_,i)=>({description:`Example item ${i+1} - planned treatment with materials, quantities and clinical scope confirmed separately.`,quantity:1,unitPrice:200,total:200})),subtotal:7000,discount:0,total:7000};
writeFileSync('tmp/pdfs/invoice-long.pdf',await renderConsultationPdf({...context,kind:'INVOICE',invoice:longInvoice}));
console.log('tmp/pdfs/invoice-long.pdf');

const {TreatmentPlanDocument}=await import(require('node:url').pathToFileURL(path.join(root,'tmp/pdfs/patient-proposal-document.mjs')));
const {renderToBuffer}=await import('@react-pdf/renderer');
const legacyPlan={title:'Two-visit implant treatment estimate',currency:'USD',createdAt:'2026-10-08',patient:context.patient,items:[{description:'Dental implants',quantity:12,unitPrice:350,cost:4200,phaseNumber:1,material:'Titanium',brand:'Example implant brand'},{description:'Implant-supported crowns',quantity:24,unitPrice:120,cost:2880,phaseNumber:2,material:'Zirconia'}],phases:[{phaseNumber:1,name:'Implant treatment',healingPeriodMonths:4},{phaseNumber:2,name:'Final crowns'}],cardFeePercent:16,cashDiscountPercent:0,paymentTerms:'Visit payments are agreed separately before travel.'};
writeFileSync('tmp/pdfs/plan-legacy.pdf',await renderToBuffer(TreatmentPlanDocument(legacyPlan,context.clinic)));
console.log('tmp/pdfs/plan-legacy.pdf');

})().catch(error=>{console.error(error);process.exitCode=1;});
