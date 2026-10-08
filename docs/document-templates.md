# Treatment plans and invoices

The document templates use the existing patient, treatment plan, invoice and payment records. Displaying a PDF does not change those amounts or mark an invoice paid.

In **Settings**, the treatment plan document settings include **Invoice billing details**. Enter the clinic's legal business name, tax or registration identifier, and payment instructions, then save the document settings. Missing billing identifiers and payment instructions are omitted. Missing invoice issue and due dates are labelled rather than invented.

Newly generated documents use these templates. Use **Regenerate** in the patient's documents panel to create a new version of an existing document; previously saved PDF versions retain their original layout.

Treatment estimates show visit fees, quantities, unit prices, discounts, included services and the configured payment terms. Invoice totals come from the saved invoice. Only completed payments in the invoice currency reduce its displayed balance; other currencies prompt reconciliation. An overpayment appears as a credit balance.

Run `node scripts/verify-professional-documents.cjs` from the repository root after building `@dental-crm/shared` to render fictional examples. This covers all ten invoice languages, English and Arabic consultation plans, a long invoice, and a legacy treatment plan. Generated previews are ignored under `tmp/pdfs`.

The embedded Noto Sans bold font must have its own PostScript name, `NotoSans-Bold`. PDFKit caches embedded fonts by that name; sharing `NotoSans-Regular` between weights causes the first loaded weight to replace the other. The font's style and name metadata were corrected; its glyphs and SIL Open Font License are retained.
