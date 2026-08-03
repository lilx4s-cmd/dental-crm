import { $Enums } from '@prisma/client';
import { LeadsService } from './leads.service';

// Converting a lead to a patient used to copy a name, an email and a phone number. Everything the
// patient had declared on the enquiry form — medications, conditions, previous surgeries, blood
// thinners — stayed on the lead, so the record a dentist opens before treating somebody showed
// none of it. These tests pin the carry-over, because the failure is silent: nothing errors, the
// patient is simply created with an empty medical history.

type Recorded = { patient?: Record<string, unknown> };

/** A Prisma double thin enough to see exactly what `patient.create` was handed. */
function makePrisma(lead: Record<string, unknown>, recorded: Recorded) {
  const tx = {
    patient: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        recorded.patient = data;
        return Promise.resolve({ id: 'patient-1', ...data });
      },
    },
    lead: { update: () => Promise.resolve({ id: 'lead-1' }) },
    leadActivity: { create: () => Promise.resolve({}) },
  };
  return {
    lead: { findUnique: () => Promise.resolve(lead) },
    $transaction: (fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx)),
  } as never;
}

const INTAKE = {
  createdAt: new Date('2026-07-01'),
  dateOfBirth: new Date('1979-04-11'),
  gender: $Enums.Gender.FEMALE,
  nationality: 'French',
  countryOfResidence: 'France',
  allergies: 'Penicillin',
  medications: 'Warfarin',
  medicalConditions: 'Atrial fibrillation',
  previousSurgeries: 'Appendectomy 2011',
  isSmoker: false,
  drinksAlcohol: true,
  isPregnant: false,
  takesBloodThinners: true,
  heightCm: 168,
  weightKg: 64,
};

function leadWith(intakeSubmissions: unknown[]) {
  return {
    id: 'lead-1',
    firstName: 'Marie',
    lastName: 'Dubois',
    email: 'marie@example.com',
    phone: '905551112233',
    whatsappNumber: null,
    stage: $Enums.PipelineStage.NEGOTIATION,
    assignedTo: null,
    intakeSubmissions,
  };
}

describe('convertToPatient — medical history carry-over', () => {
  it('copies every clinical answer onto the patient', async () => {
    const recorded: Recorded = {};
    const service = new LeadsService(makePrisma(leadWith([INTAKE]), recorded));

    await service.convertToPatient('lead-1');

    expect(recorded.patient).toMatchObject({
      allergies: 'Penicillin',
      medications: 'Warfarin',
      medicalConditions: 'Atrial fibrillation',
      previousSurgeries: 'Appendectomy 2011',
      takesBloodThinners: true,
      isSmoker: false,
      drinksAlcohol: true,
      isPregnant: false,
      heightCm: 168,
      weightKg: 64,
      nationality: 'French',
      country: 'France',
    });
  });

  it('leaves an unanswered question unanswered rather than answering it "no"', async () => {
    // The distinction that matters clinically: "we never asked about blood thinners" and "the
    // patient said they take none" are different facts, and only one of them is safe to act on.
    const recorded: Recorded = {};
    const partial = { ...INTAKE, takesBloodThinners: null, isSmoker: null, medications: null };
    const service = new LeadsService(makePrisma(leadWith([partial]), recorded));

    await service.convertToPatient('lead-1');

    expect(recorded.patient?.takesBloodThinners).toBeUndefined();
    expect(recorded.patient?.isSmoker).toBeUndefined();
    expect(recorded.patient?.medications).toBeUndefined();
  });

  it('takes the most recent submission when the form was filled more than once', async () => {
    // LEAD_DETAIL_SELECT orders submissions newest first; the newer answers are the current ones.
    const recorded: Recorded = {};
    const newer = { ...INTAKE, medications: 'Apixaban', createdAt: new Date('2026-07-20') };
    const older = { ...INTAKE, medications: 'Warfarin', createdAt: new Date('2026-01-05') };
    const service = new LeadsService(makePrisma(leadWith([newer, older]), recorded));

    await service.convertToPatient('lead-1');

    expect(recorded.patient?.medications).toBe('Apixaban');
  });

  it('still converts a lead that never filled the form in', async () => {
    // Walk-ins and phone enquiries have no submission at all; conversion must not depend on one.
    const recorded: Recorded = {};
    const service = new LeadsService(makePrisma(leadWith([]), recorded));

    await service.convertToPatient('lead-1');

    expect(recorded.patient).toMatchObject({ firstName: 'Marie', lastName: 'Dubois' });
    expect(recorded.patient?.medications).toBeUndefined();
  });
});
