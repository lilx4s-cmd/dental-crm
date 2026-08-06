import { patientGuidance, patientSteps, type PatientSnapshot } from '@dental-crm/shared';

/**
 * The patient side had no equivalent of the pipeline's `nextAction`: once a lead converted, the
 * CRM stopped offering an opinion and became a set of forms somebody had to remember to fill in —
 * at exactly the point where the cost of forgetting rises.
 *
 * Most of what is worth testing here is about *not* declaring something safe.
 */
const blank: PatientSnapshot = {
  firstName: 'Ahmed',
  lastName: 'Al-Rashid',
  phone: null,
  whatsappNumber: null,
  email: null,
  dateOfBirth: null,
  country: null,
  allergies: null,
  medications: null,
  medicalConditions: null,
  takesBloodThinners: null,
  isPregnant: null,
  diagnosis: null,
  aftercareStartedAt: null,
  treatmentPlanCount: 0,
  approvedPlanCount: 0,
  upcomingAppointmentCount: 0,
  pastAppointmentCount: 0,
  invoiceCount: 0,
  fullyPaid: false,
  hasPassportOnFile: false,
  warrantyCount: 0,
};

const patient = (over: Partial<PatientSnapshot> = {}): PatientSnapshot => ({ ...blank, ...over });
const step = (p: PatientSnapshot, id: string) => patientSteps(p).find((s) => s.id === id);

describe('“not asked” is never “no”', () => {
  it('treats a null allergy field as unanswered', () => {
    // The whole reason this exists. A blank is an open question; a checklist that ticks it
    // converts that question into a silent assumption, on a record a clinician treats from.
    expect(step(patient(), 'allergies')?.done).toBe(false);
  });

  it('treats a recorded "None" as answered', () => {
    // Somebody asked and there were none. That is a clinical record, not an empty field.
    expect(step(patient({ allergies: 'None' }), 'allergies')?.done).toBe(true);
  });

  it('treats an empty string as unanswered', () => {
    // A form submitted with the field untouched stores '', which passes a null check and tells a
    // dentist nothing.
    expect(step(patient({ allergies: '' }), 'allergies')?.done).toBe(false);
    expect(step(patient({ allergies: '   ' }), 'allergies')?.done).toBe(false);
  });

  it('treats an explicit false on blood thinners as answered', () => {
    // false is an answer. Only null is not.
    expect(step(patient({ takesBloodThinners: false }), 'bloodThinners')?.done).toBe(true);
    expect(step(patient({ takesBloodThinners: null }), 'bloodThinners')?.done).toBe(false);
  });

  it('says something different for yes than for no', () => {
    const yes = step(patient({ takesBloodThinners: true }), 'bloodThinners');
    const no = step(patient({ takesBloodThinners: false }), 'bloodThinners');
    expect(yes?.why).not.toBe(no?.why);
    expect(yes?.why).toMatch(/surgical/i);
  });

  it('asks about pregnancy of everybody rather than inferring it', () => {
    // Not derived from a gender field, which is both unreliable and not the clinic's to infer.
    expect(step(patient(), 'pregnancy')?.done).toBe(false);
    expect(step(patient({ isPregnant: false }), 'pregnancy')?.done).toBe(true);
  });
});

describe('what to do first', () => {
  it('puts safety above everything else', () => {
    const { nextStep } = patientGuidance(patient());
    expect(nextStep?.severity).toBe('safety');
  });

  it('moves to blocking work once the safety questions are answered', () => {
    const safe = patient({
      allergies: 'None',
      medications: 'None',
      medicalConditions: 'None',
      takesBloodThinners: false,
      isPregnant: false,
    });

    const { nextStep } = patientGuidance(safe);

    expect(nextStep?.severity).toBe('blocking');
  });

  it('never puts admin work ahead of a missing allergy question', () => {
    // A patient mid-treatment with an unpaid invoice and no allergy record: the invoice is not
    // the thing to do next.
    const mid = patient({
      pastAppointmentCount: 1,
      treatmentPlanCount: 1,
      approvedPlanCount: 1,
      invoiceCount: 0,
    });

    expect(patientGuidance(mid).nextStep?.id).toBe('allergies');
  });

  it('reports nothing to do when everything is covered', () => {
    const complete = patient({
      phone: '905551234567',
      dateOfBirth: new Date('1990-01-01'),
      allergies: 'None',
      medications: 'None',
      medicalConditions: 'None',
      takesBloodThinners: false,
      isPregnant: false,
      diagnosis: 'Upper-arch implants',
      treatmentPlanCount: 1,
      approvedPlanCount: 1,
      pastAppointmentCount: 1,
      invoiceCount: 1,
      fullyPaid: true,
      hasPassportOnFile: true,
      warrantyCount: 1,
      aftercareStartedAt: new Date(),
    });

    const guidance = patientGuidance(complete);

    expect(guidance.nextStep).toBeNull();
    expect(guidance.outstanding).toHaveLength(0);
    expect(guidance.completeness).toBe(100);
  });
});

describe('steps that only apply at a point in the journey', () => {
  it('does not ask to book an appointment before there is a plan', () => {
    // Nothing to book chair time for. Offering it is noise on a record that has a real next step.
    expect(step(patient(), 'appointment')).toBeUndefined();
  });

  it('asks to book once a plan exists', () => {
    expect(step(patient({ treatmentPlanCount: 1 }), 'appointment')?.done).toBe(false);
  });

  it('stops asking to book after treatment has happened', () => {
    // Otherwise every finished case carries a permanent "book the first appointment".
    expect(step(patient({ treatmentPlanCount: 1, pastAppointmentCount: 2 }), 'appointment')).toBeUndefined();
  });

  it('does not ask for approval before a plan exists', () => {
    expect(step(patient(), 'approval')).toBeUndefined();
    expect(step(patient({ treatmentPlanCount: 1 }), 'approval')?.done).toBe(false);
  });

  it('does not chase an invoice before anything is agreed', () => {
    // Billing for work nobody approved is how a dispute starts.
    expect(step(patient(), 'invoice')).toBeUndefined();
    expect(step(patient({ treatmentPlanCount: 1, approvedPlanCount: 1 }), 'invoice')?.done).toBe(false);
  });

  it('only mentions warranty and aftercare after treatment', () => {
    expect(step(patient({ treatmentPlanCount: 1, approvedPlanCount: 1 }), 'warranty')).toBeUndefined();
    expect(step(patient({ pastAppointmentCount: 1 }), 'warranty')?.done).toBe(false);
    expect(step(patient({ pastAppointmentCount: 1 }), 'aftercare')?.done).toBe(false);
  });

  it('asks for a passport only once travel is real', () => {
    expect(step(patient(), 'passport')).toBeUndefined();
    expect(step(patient({ upcomingAppointmentCount: 1 }), 'passport')?.done).toBe(false);
  });
});

describe('being reachable', () => {
  it('counts any one channel as reachable', () => {
    expect(step(patient({ phone: '905551234567' }), 'contact')?.done).toBe(true);
    expect(step(patient({ email: 'a@example.com' }), 'contact')?.done).toBe(true);
    expect(step(patient({ whatsappNumber: '905551234567' }), 'contact')?.done).toBe(true);
  });

  it('flags a patient with no channel at all', () => {
    const s = step(patient(), 'contact');
    expect(s?.done).toBe(false);
    expect(s?.severity).toBe('blocking');
  });
});

describe('the summary', () => {
  it('keeps finished steps in the list rather than hiding them', () => {
    // A checklist that empties itself gives no sense of where a patient is, and somebody arriving
    // mid-treatment needs to see what has been covered as much as what has not.
    const guidance = patientGuidance(patient({ allergies: 'None' }));
    expect(guidance.steps.some((s) => s.id === 'allergies' && s.done)).toBe(true);
  });

  it('counts what is outstanding by severity', () => {
    const guidance = patientGuidance(patient());
    expect(guidance.counts.safety).toBe(5);
    expect(guidance.counts.blocking).toBeGreaterThan(0);
    expect(guidance.counts.done).toBe(0);
  });

  it('floors completeness so a record one step short never reads as finished', () => {
    // 8 of 9 is 88.9%. Rounding would show 89; the danger is a rule that rounds 99.5 to 100.
    const nearly = patient({
      phone: '905551234567',
      dateOfBirth: new Date('1990-01-01'),
      allergies: 'None',
      medications: 'None',
      medicalConditions: 'None',
      takesBloodThinners: false,
      isPregnant: false,
      diagnosis: 'Upper-arch implants',
      // Plan missing.
    });

    const guidance = patientGuidance(nearly);

    expect(guidance.completeness).toBeLessThan(100);
    expect(guidance.nextStep?.id).toBe('plan');
  });

  it('gives every step a reason, not just a label', () => {
    // A list of red ticks trains people to clear them. A list that explains gets read.
    for (const s of patientSteps(patient())) {
      expect(s.why.length).toBeGreaterThan(20);
      expect(s.label.length).toBeGreaterThan(5);
    }
  });
});
