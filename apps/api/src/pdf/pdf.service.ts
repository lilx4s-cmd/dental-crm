import { Injectable } from '@nestjs/common';
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer';
import * as QRCode from 'qrcode';
import React from 'react';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 16, borderBottom: 1, borderBottomColor: '#333', paddingBottom: 8 },
  clinicName: { fontSize: 16, fontWeight: 700 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#555', fontWeight: 700 },
  section: { marginTop: 12, marginBottom: 8 },
  table: { marginTop: 8, borderTop: 1, borderTopColor: '#ccc' },
  tableRow: { flexDirection: 'row', borderBottom: 1, borderBottomColor: '#eee', paddingVertical: 4 },
  tableHeaderRow: { flexDirection: 'row', paddingVertical: 4, backgroundColor: '#f2f2f2' },
  cell: { flex: 1, fontSize: 9 },
  cellSmall: { flex: 0.6, fontSize: 9 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  qr: { width: 90, height: 90, position: 'absolute', top: 32, right: 32 },
  footer: { marginTop: 24, fontSize: 8, color: '#888' },
});

interface ClinicBranding {
  clinicName: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
}

// Accepts Prisma's Decimal instances too — anything stringifiable.
type Numeric = number | string | { toString(): string };

interface PlanPdfInput {
  title: string;
  totalCost: Numeric;
  currency: string;
  doctorRecommendation?: string | null;
  patient: { firstName: string; lastName: string };
  items: Array<{
    description: string;
    toothNumber?: string | null;
    material?: string | null;
    brand?: string | null;
    quantity: number;
    cost: Numeric;
  }>;
  timelineSteps: Array<{ title: string; status: string }>;
}

interface WarrantyPdfInput {
  durationMonths: number;
  startDate: Date | string;
  termsAndConditions: string;
  maintenanceRequirements?: string | null;
  exclusions?: string | null;
  annualCheckupRequired: boolean;
}

interface WarrantyItemInput {
  description: string;
  toothNumber?: string | null;
}

interface PatientInput {
  firstName: string;
  lastName: string;
}

async function buildQrDataUrl(portalUrl?: string): Promise<string | undefined> {
  if (!portalUrl) return undefined;
  try {
    return await QRCode.toDataURL(portalUrl, { margin: 1, width: 200 });
  } catch {
    return undefined;
  }
}

@Injectable()
export class PdfService {
  async generateTreatmentPlanPdf(
    plan: PlanPdfInput,
    branding: ClinicBranding,
    portalUrl?: string,
  ): Promise<Buffer> {
    const qrDataUrl = await buildQrDataUrl(portalUrl);

    const doc = React.createElement(
      Document,
      {},
      React.createElement(
        Page,
        { size: 'A4', style: styles.page },
        qrDataUrl && React.createElement(Image, { src: qrDataUrl, style: styles.qr }),
        React.createElement(
          View,
          { style: styles.header },
          React.createElement(Text, { style: styles.clinicName }, branding.clinicName),
          [branding.address, branding.city, branding.country].filter(Boolean).length > 0 &&
            React.createElement(
              Text,
              {},
              [branding.address, branding.city, branding.country].filter(Boolean).join(', '),
            ),
        ),
        React.createElement(Text, { style: styles.title }, plan.title),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.label }, 'Patient'),
          React.createElement(Text, {}, `${plan.patient.firstName} ${plan.patient.lastName}`),
        ),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeaderRow },
            React.createElement(Text, { style: styles.cell }, 'Description'),
            React.createElement(Text, { style: styles.cellSmall }, 'Tooth'),
            React.createElement(Text, { style: styles.cell }, 'Material / Brand'),
            React.createElement(Text, { style: styles.cellSmall }, 'Qty'),
            React.createElement(Text, { style: styles.cellSmall }, 'Cost'),
          ),
          ...plan.items.map((item, i) =>
            React.createElement(
              View,
              { style: styles.tableRow, key: i },
              React.createElement(Text, { style: styles.cell }, item.description),
              React.createElement(Text, { style: styles.cellSmall }, item.toothNumber ?? '-'),
              React.createElement(
                Text,
                { style: styles.cell },
                [item.material, item.brand].filter(Boolean).join(' / ') || '-',
              ),
              React.createElement(Text, { style: styles.cellSmall }, String(item.quantity)),
              React.createElement(Text, { style: styles.cellSmall }, `${plan.currency} ${item.cost}`),
            ),
          ),
        ),
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(
            Text,
            { style: { fontWeight: 700 } },
            `Total: ${plan.currency} ${plan.totalCost}`,
          ),
        ),
        plan.doctorRecommendation &&
          React.createElement(
            View,
            { style: styles.section },
            React.createElement(Text, { style: styles.label }, "Doctor's Recommendation"),
            React.createElement(Text, {}, plan.doctorRecommendation),
          ),
        plan.timelineSteps.length > 0 &&
          React.createElement(
            View,
            { style: styles.section },
            React.createElement(Text, { style: styles.label }, 'Treatment Timeline'),
            ...plan.timelineSteps.map((step, i) =>
              React.createElement(Text, { key: i }, `${i + 1}. ${step.title} — ${step.status}`),
            ),
          ),
        React.createElement(
          Text,
          { style: styles.footer },
          'This document is generated on demand and is not a substitute for a signed treatment consent form.',
        ),
      ),
    );

    return renderToBuffer(doc as never);
  }

  async generateWarrantyCertificatePdf(
    warranty: WarrantyPdfInput,
    item: WarrantyItemInput,
    patient: PatientInput,
    branding: ClinicBranding,
    portalUrl?: string,
  ): Promise<Buffer> {
    const qrDataUrl = await buildQrDataUrl(portalUrl);
    const startDate = new Date(warranty.startDate);
    const expiresDate = new Date(startDate);
    expiresDate.setMonth(expiresDate.getMonth() + warranty.durationMonths);

    const doc = React.createElement(
      Document,
      {},
      React.createElement(
        Page,
        { size: 'A4', style: styles.page },
        qrDataUrl && React.createElement(Image, { src: qrDataUrl, style: styles.qr }),
        React.createElement(
          View,
          { style: styles.header },
          React.createElement(Text, { style: styles.clinicName }, branding.clinicName),
          [branding.address, branding.city, branding.country].filter(Boolean).length > 0 &&
            React.createElement(
              Text,
              {},
              [branding.address, branding.city, branding.country].filter(Boolean).join(', '),
            ),
        ),
        React.createElement(Text, { style: styles.title }, 'Certificate of Warranty'),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.label }, 'Patient'),
          React.createElement(Text, {}, `${patient.firstName} ${patient.lastName}`),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.label }, 'Procedure'),
          React.createElement(
            Text,
            {},
            `${item.description}${item.toothNumber ? ` (tooth ${item.toothNumber})` : ''}`,
          ),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.label }, 'Duration'),
          React.createElement(Text, {}, `${warranty.durationMonths} months`),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.label }, 'Coverage Period'),
          React.createElement(
            Text,
            {},
            `${startDate.toDateString()} - ${expiresDate.toDateString()}`,
          ),
        ),
        React.createElement(
          View,
          { style: styles.section },
          React.createElement(Text, { style: styles.label }, 'Terms & Conditions'),
          React.createElement(Text, {}, warranty.termsAndConditions),
        ),
        warranty.maintenanceRequirements &&
          React.createElement(
            View,
            { style: styles.section },
            React.createElement(Text, { style: styles.label }, 'Maintenance Requirements'),
            React.createElement(Text, {}, warranty.maintenanceRequirements),
          ),
        warranty.exclusions &&
          React.createElement(
            View,
            { style: styles.section },
            React.createElement(Text, { style: styles.label }, 'Exclusions'),
            React.createElement(Text, {}, warranty.exclusions),
          ),
        warranty.annualCheckupRequired &&
          React.createElement(
            Text,
            { style: styles.section },
            'An annual checkup is required to maintain this warranty.',
          ),
        React.createElement(
          Text,
          { style: styles.footer },
          'This certificate is generated on demand and is not a substitute for the original signed agreement.',
        ),
      ),
    );

    return renderToBuffer(doc as never);
  }
}
