import { ConsultationSchema, DocumentConfigurationSchema, type Consultation } from './consultation';
import { consultationCopy } from './consultation-copy';
import { consultationPresentationCopy } from './consultation-presentation';

/** Fictional demonstration only. Never creates a patient, payment, share link or clinic record. */
export function consultationExample(language: Consultation['language'] = 'en') {
  const t = consultationCopy(language),
    p = consultationPresentationCopy(language);
  const plan = ConsultationSchema.parse({
    version: 1,
    language,
    currency: 'USD',
    treatmentText: `2 × ${t.implant} + 2 × ${t.implantCrown}`,
    lines: [{
      id: 'example-implants',
      type: 'implant',
      quantity: 2,
      unitPrice: 450,
      discount: 100,
      overrideReason: 'Fictional demonstration discount',
      visit: 1,
      positions: ['12', '22'],
      material: 'Titanium',
      brand: 'Example implant brand'
    }, {
      id: 'example-crowns',
      type: 'implantCrown',
      quantity: 2,
      unitPrice: 250,
      visit: 2,
      positions: ['12', '22'],
      material: 'Zirconia'
    }],
    visits: [{
      number: 1,
      treatmentDays: 4,
      nights: 5,
      hotelRate: 60,
      hotelIncluded: true,
      transfer: 'included',
      transferPrice: 0,
      itinerary: []
    }, {
      number: 2,
      treatmentDays: 5,
      nights: 7,
      hotelRate: 60,
      hotelIncluded: false,
      transfer: 'paid',
      transferPrice: 75,
      itinerary: []
    }],
    healing: {
      minMonths: 3,
      maxMonths: 4
    },
    findings: {
      '12': 'missing',
      '22': 'missing',
      '11': 'healthy',
      '21': 'healthy',
      '16': 'existingCrown',
      '26': 'healthy'
    },
    includedServices: [`${t.hotel} · ${t.visit} 1`, `${t.transfer} · ${t.visit} 1`]
  });
  return {
    plan,
    patient: {
      id: 'fictional-example',
      firstName: language === 'ar' ? 'ليلى' : 'Layla',
      lastName: language === 'ar' ? 'مثال' : 'Example'
    },
    clinic: {
      clinicName: 'Example Dental Clinic',
      city: 'Istanbul',
      country: 'Türkiye',
      email: 'clinic@example.org',
      website: 'example.org'
    },
    config: DocumentConfigurationSchema.parse({
      representative: language === 'ar' ? 'منسق المرضى — مثال' : 'Example Patient Coordinator',
      accentColor: '#183858'
    }),
    payment: {
      cardFee: 3,
      cashDiscount: 2,
      depositAmount: 300,
      terms: language === 'ar' ? 'تُؤكد مواعيد الدفع لكل زيارة مع منسق المرضى قبل حجز السفر. هذا مثال توضيحي ولا يمثل طلب دفع.' : 'Agree the payment dates for each visit with your patient coordinator before booking travel. This fictional example is not a payment request.'
    },
    generatedAt: '2026-10-08T00:00:00Z',
    documentId: 'FICTIONAL-EXAMPLE-001',
    version: 1,
    title: p.estimate
  };
}
