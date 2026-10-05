// Run after npm run build:api:
// node apps/api/scripts/verify-treatment-plan-pdf.cjs /absolute/output/directory
// Synthetic acceptance fixtures only; this script never reads patient records or opens a DB.
const fs = require('node:fs/promises');
const path = require('node:path');
const { renderToBuffer } = require('@react-pdf/renderer');
const { TreatmentPlanDocument } = require('../dist/pdf/treatment-plan-document');

async function main() {
  const output = path.resolve(process.argv[2] || '/tmp/dental-crm-pdf-verification');
  await fs.mkdir(output, { recursive: true });
  const branding = { clinicName: 'Example Dental Clinic', city: 'Istanbul', country: 'Turkey', email: 'coordinator@example.test' };
  const priced = {
    title: 'Two-visit implant and restoration proposal — sample', currency: 'USD',
    createdAt: '2026-10-05', patient: { firstName: 'Example', lastName: 'Patient' },
    doctorRecommendation: 'A staged proposal for implant placement followed by final restorations. This sample demonstrates the quotation format; all clinical details and fees are illustrative.',
    items: [
      { description: 'Implant placement', quantity: 7, unitPrice: 3000 / 7, cost: '3000', phaseNumber: 1, toothCondition: 'IMPLANT', toothNumber: '11,14,16,21,24,34,44', material: 'Titanium', clinicalNotes: 'Final implant positions and brand require the treating dentist’s confirmation.' },
      { description: 'Final zirconia restorations', quantity: 24, unitPrice: 125, cost: '3000', phaseNumber: 2, toothCondition: 'CROWN', toothNumber: '11-16,21-26,31-36,41-46', material: 'Zirconia', brand: 'Dental Direkt', clinicalNotes: 'Cement-retained design, subject to clinical confirmation.' },
    ],
    phases: [{ phaseNumber: 1, name: 'Implant placement', healingPeriodMonths: 3 }, { phaseNumber: 2, name: 'Final restorations' }],
    packageIncludes: ['HOTEL', 'AIRPORT_TRANSFER', 'WARRANTY'], depositAmount: '300', cardFeePercent: 5, cashDiscountPercent: 0,
    paymentTerms: 'Visit 1: USD 3,000. Visit 2: USD 3,000, quoted separately. Approximately 7 days are planned for the second visit once healing is confirmed. Confirm hotel nights and transfer coverage for each visit before booking.',
  };
  const fixtures = [
    ['Treatment_Plan_Preview.pdf', priced],
    ['Unpriced_Plan_Check.pdf', { ...priced, title: 'Unpriced draft — verification', items: [{ description: 'Crown awaiting quotation', quantity: 1, unitPrice: null, cost: 0, phaseNumber: 1 }], phases: [], depositAmount: null }],
    ['Detailed_Plan_Check.pdf', { ...priced, diagnoses: [{ condition: 'MISSING', toothNumbers: ['11', '14'], notes: 'Synthetic assessment for chart verification.' }], stay: { nights: 7, hotelName: 'Example Hotel', arrivalDate: '2026-11-01', departureDate: '2026-11-08' }, scheduleItems: [{ date: '2026-11-02', title: 'Clinical assessment', location: 'Example Clinic' }] }],
    ['Long_Plan_Check.pdf', { ...priced, title: 'Long proposal — pagination check', items: Array.from({ length: 40 }, (_, index) => ({ description: 'Procedure ' + (index + 1), quantity: 1, unitPrice: 125, cost: 125, phaseNumber: index < 20 ? 1 : 2, clinicalNotes: 'A longer clinical note that must remain visible when the treatment table continues onto another page. '.repeat(index === 20 ? 15 : 2) })), paymentTerms: 'Extended payment notes. '.repeat(80) }],
  ];
  for (const [name, plan] of fixtures) {
    const buffer = await renderToBuffer(TreatmentPlanDocument(plan, branding));
    if (buffer.subarray(0, 5).toString() !== '%PDF-' || buffer.length < 2000) throw new Error('Invalid PDF: ' + name);
    await fs.writeFile(path.join(output, name), buffer);
    console.log(name + ': ' + buffer.length + ' bytes');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
