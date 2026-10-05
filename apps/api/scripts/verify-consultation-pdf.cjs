// Synthetic fixtures only. No database, patient records or external messages.
const fs = require('node:fs/promises');
const path = require('node:path');
const { renderConsultationPdf } = require('../dist/documents/consultation-pdf');
const { DocumentConfigurationSchema, parseConsultation, ConsultationSchema } = require('@dental-crm/shared');
async function main() {
 const output = process.argv[2];
 if (!output || !path.isAbsolute(output)) throw new Error('Provide an absolute temporary output directory');
 await fs.mkdir(output, { recursive: true });
 const config = DocumentConfigurationSchema.parse({ priceList: [{ type: 'implant', currency: 'USD', unitPrice: 350 }, { type: 'crown', currency: 'USD', unitPrice: 120, material: 'Zirconia' }], healing: { minMonths: 3, maxMonths: 4 }, warranties: [{ type: 'implant', duration: 'lifetime', summary: 'Illustrative contractual lifetime coverage; clinic-approved terms govern.' }, { type: 'crown', duration: 'months', months: 240, summary: 'Illustrative 20-year product coverage; clinic-approved terms govern.' }] });
 for (const language of ['en','ar','fr','de','es']) {
  const lines = parseConsultation('12 implants + 24 zirconium crowns', 'USD', config).lines;
  lines[0].positions = ['16','14','12','22','24','26','46','44','42','32','34','36'];
  lines[1].positions = ['16','15','14','13','12','11','21','22','23','24','25','26','46','45','44','43','42','41','31','32','33','34','35','36'];
  const plan = ConsultationSchema.parse({ version: 1, language, currency: 'USD', treatmentText: language === 'ar' ? '١٢ زرعة سنية + ٢٤ تاج زركونيا - معاينة تجريبية' : '12 implants + 24 zirconia crowns - synthetic preview', lines, visits: [1,2].map(number => ({ number, nights: number === 1 ? 5 : 7, hotelRate: 60, hotelIncluded: false, transfer: 'included', transferPrice: 0 })), healing: config.healing, findings: {}, includedServices: [] });
  const data = await renderConsultationPdf({ plan, config, generatedAt: '2026-10-05', patient: { id: 'synthetic-preview', firstName: language === 'ar' ? 'معاينة' : 'Preview', lastName: language === 'ar' ? 'تجريبية' : 'Patient', medicalConditions: language === 'ar' ? 'بيانات اختبار فقط' : 'Synthetic test information only' }, clinic: { clinicName: 'Venedik Dental Clinic', city: 'Istanbul', country: 'Türkiye' } });
  const file = path.join(output, `consultation-${language}.pdf`); await fs.writeFile(file,data); process.stdout.write(`${language}: ${data.length} bytes\n`);
 }
}
main().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode=1; });
