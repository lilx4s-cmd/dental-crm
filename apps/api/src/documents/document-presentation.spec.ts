import { documentLabels, documentDate, invoiceDisplayTotals, invoiceStatusLabel } from './document-presentation';
import { DOCUMENT_LANGUAGES, DocumentConfigurationSchema } from '@dental-crm/shared';
it.each(DOCUMENT_LANGUAGES)('has complete presentation labels and invoice status in %s', language => {
  expect(Object.values(documentLabels(language)).every(value => typeof value === 'string' && value.length > 0)).toBe(true);
  expect(invoiceStatusLabel('DRAFT', language)).toBe(documentLabels(language).draft);
});
it('shows paid, balance, and overpayment using decimal arithmetic', () => {
  const payments = [{ amount: '0.10', status: 'COMPLETED' }, { amount: '0.20', status: 'COMPLETED' }, { amount: '100.00', status: 'PENDING' }];
  expect(invoiceDisplayTotals({ total: '0.30', payments }, 'USD')).toMatchObject({ paid: 0.3, balance: 0, credit: 0 });
  expect(invoiceDisplayTotals({ total: '0.25', payments }, 'USD')).toMatchObject({ paid: 0.3, balance: 0, credit: 0.05 });
});
it('does not count another currency as a payment against this invoice', () => {
  expect(invoiceDisplayTotals({ total: 7000, payments: [{ amount: 1000, status: 'COMPLETED', currency: 'USD' }, { amount: 500, status: 'COMPLETED', currency: 'EUR' }] }, 'USD')).toMatchObject({ paid: 1000, balance: 6000, currencyReview: true });
});
it('preserves missing dates and optional clinic billing details without invented values', () => {
  expect(documentDate(null)).toBe(''); expect(documentDate('invalid')).toBe('');
  expect(documentDate('2026-10-08T00:00:00Z')).toBe('2026-10-08');
  const config = DocumentConfigurationSchema.parse({ billingLegalName: 'Example Clinic', billingTaxId: 'EXAMPLE', invoicePaymentInstructions: 'Use the invoice reference' });
  expect(config.billingLegalName).toBe('Example Clinic');
  expect(DocumentConfigurationSchema.parse({}).billingTaxId).toBeUndefined();
});
