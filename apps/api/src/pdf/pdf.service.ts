import { Injectable } from '@nestjs/common';
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer';
import * as QRCode from 'qrcode';
import React from 'react';

import {
  TreatmentPlanDocument,
  type ClinicBranding,
  type PlanDocumentInput,
} from './treatment-plan-document';

// Styling for the warranty certificate, which stays a single self-contained page. The treatment
// plan's own styles live with its document in treatment-plan-document.ts.
const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 16, borderBottom: 1, borderBottomColor: '#333', paddingBottom: 8 },
  clinicName: { fontSize: 16, fontWeight: 700 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#555', fontWeight: 700 },
  section: { marginTop: 12, marginBottom: 8 },
  qr: { width: 90, height: 90, position: 'absolute', top: 32, right: 32 },
  footer: { marginTop: 24, fontSize: 8, color: '#888' },
});

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
    plan: PlanDocumentInput,
    branding: ClinicBranding,
    portalUrl?: string,
  ): Promise<Buffer> {
    const qrDataUrl = await buildQrDataUrl(portalUrl);
    const doc = TreatmentPlanDocument(plan, branding, qrDataUrl, portalUrl);
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
