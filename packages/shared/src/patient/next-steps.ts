/**
 * What to do next with a patient, and what is missing from their record.
 *
 * The pipeline has had this since `nextAction` — it tells a salesperson which deal to chase and
 * why. The patient side had nothing. Once a lead converts, the CRM stops offering an opinion and
 * becomes a set of forms somebody has to remember to fill in, at exactly the point where the cost
 * of forgetting rises: a missing follow-up on a deal loses a sale, a missing allergy question
 * precedes an injection.
 *
 * Three rules shape this list.
 *
 * **Ordered by consequence, not by convenience.** Anything that could hurt somebody comes before
 * anything that delays a payment, which comes before anything that is merely untidy. The first
 * item is always the one it would be worst to skip.
 *
 * **"Not asked" is not "no".** `allergies` null means nobody has asked; the string "None" means
 * somebody asked and there were none. Those are different facts and the second one is a clinical
 * record. A checklist that treats a blank as satisfied is worse than no checklist — it converts an
 * open question into a silent assumption.
 *
 * **Every step says why.** A list of red ticks trains people to clear them; a list that says
 * "nobody has recorded whether this patient takes blood thinners, and they are booked for an
 * extraction on Thursday" gets read.
 */

export type StepSeverity = 'safety' | 'blocking' | 'admin';

export interface PatientStep {
  id: string;
  /** The action, phrased as the thing to do. */
  label: string;
  /** What it costs to skip. Shown next to the step, not hidden behind a tooltip. */
  why: string;
  severity: StepSeverity;
  done: boolean;
  /** Where in the app it gets done, relative to the patient record. */
  target?: 'overview' | 'medical' | 'plans' | 'appointments' | 'files' | 'finance';
}

/**
 * What the checklist needs to know. Deliberately a flat shape rather than a Prisma model, so the
 * rules stay testable without a database and the caller decides what to count.
 */
export interface PatientSnapshot {
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  dateOfBirth: Date | string | null;
  country: string | null;
  /** Null means nobody asked. See the note above. */
  allergies: string | null;
  medications: string | null;
  medicalConditions: string | null;
  takesBloodThinners: boolean | null;
  isPregnant: boolean | null;
  diagnosis: string | null;
  aftercareStartedAt: Date | string | null;

  treatmentPlanCount: number;
  approvedPlanCount: number;
  upcomingAppointmentCount: number;
  /** Appointments that have already happened, so "book one" is not suggested after treatment. */
  pastAppointmentCount: number;
  invoiceCount: number;
  /** Whether every invoice raised has been settled. */
  fullyPaid: boolean;
  hasPassportOnFile: boolean;
  warrantyCount: number;
}

const SAFETY_UNKNOWN =
  'A clinician planning treatment reads this record. A blank here is an open question, not a "no".';

/**
 * Whether a medical answer has actually been given.
 *
 * An empty string counts as unanswered — a form submitted with the field untouched stores `''`,
 * which looks answered to a null check and says nothing to a dentist.
 */
function answered(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function present(value: Date | string | null | undefined): boolean {
  return value !== null && value !== undefined && value !== '';
}

/**
 * The full list, in the order it should be worked through.
 *
 * Steps that are already done stay in the list rather than disappearing. A checklist that empties
 * itself gives no sense of where a patient is in their journey, and somebody arriving at a record
 * mid-treatment needs to see what has been covered as much as what has not.
 */
export function patientSteps(p: PatientSnapshot): PatientStep[] {
  const steps: PatientStep[] = [];

  // ── Safety. Nothing else outranks these. ──────────────────────────────────────────────────────
  steps.push({
    id: 'allergies',
    label: 'Ask about allergies and record the answer',
    why: answered(p.allergies)
      ? 'Recorded.'
      : `Nobody has asked, or the answer was not written down. ${SAFETY_UNKNOWN} Write "None" if there are none — that is a different record from a blank.`,
    severity: 'safety',
    done: answered(p.allergies),
    target: 'medical',
  });

  steps.push({
    id: 'medications',
    label: 'Record current medications',
    why: answered(p.medications)
      ? 'Recorded.'
      : `Interactions with anaesthetic and antibiotics are decided from this. ${SAFETY_UNKNOWN}`,
    severity: 'safety',
    done: answered(p.medications),
    target: 'medical',
  });

  steps.push({
    id: 'bloodThinners',
    label: 'Ask whether they take blood thinners',
    why:
      p.takesBloodThinners === null
        ? 'Unanswered. This changes whether an extraction can go ahead the same day, and is the question whose absence is most likely to be noticed in the chair.'
        : p.takesBloodThinners
          ? 'Yes — surgical steps need planning around it.'
          : 'Answered: no.',
    severity: 'safety',
    done: p.takesBloodThinners !== null,
    target: 'medical',
  });

  steps.push({
    id: 'conditions',
    label: 'Record medical conditions',
    why: answered(p.medicalConditions)
      ? 'Recorded.'
      : `Diabetes, heart conditions and immune suppression all change how a surgical site is managed. ${SAFETY_UNKNOWN}`,
    severity: 'safety',
    done: answered(p.medicalConditions),
    target: 'medical',
  });

  // Asked of everyone rather than guessed at from a gender field, which is both unreliable and not
  // the clinic's to infer.
  steps.push({
    id: 'pregnancy',
    label: 'Ask about pregnancy',
    why:
      p.isPregnant === null
        ? 'Unanswered. It rules out radiographs and several medications, so it has to be asked before imaging rather than after.'
        : p.isPregnant
          ? 'Yes — no radiographs, and check every prescription.'
          : 'Answered: no.',
    severity: 'safety',
    done: p.isPregnant !== null,
    target: 'medical',
  });

  // ── Blocking. Work cannot correctly proceed without these. ────────────────────────────────────
  const reachable = !!(p.phone || p.whatsappNumber || p.email);
  steps.push({
    id: 'contact',
    label: 'Add a way to reach them',
    why: reachable
      ? 'On file.'
      : 'No phone, WhatsApp or email. Nothing can be confirmed, no reminder can be sent, and an appointment change cannot be told to them.',
    severity: 'blocking',
    done: reachable,
    target: 'overview',
  });

  steps.push({
    id: 'dob',
    label: 'Record date of birth',
    why: present(p.dateOfBirth)
      ? 'On file.'
      : 'Dosages are weight- and age-dependent, and it is what distinguishes two patients with the same name.',
    severity: 'blocking',
    done: present(p.dateOfBirth),
    target: 'overview',
  });

  steps.push({
    id: 'diagnosis',
    label: 'Record a diagnosis',
    why: answered(p.diagnosis)
      ? 'Recorded.'
      : 'The treatment plan is a proposal about something. Without a diagnosis on the record, what was quoted cannot be justified later.',
    severity: 'blocking',
    done: answered(p.diagnosis),
    target: 'overview',
  });

  steps.push({
    id: 'plan',
    label: 'Create a treatment plan',
    why:
      p.treatmentPlanCount > 0
        ? `${p.treatmentPlanCount} on file.`
        : 'Nothing has been proposed yet. The plan is what the patient approves, what the dossier prints, and what the invoice is drawn from.',
    severity: 'blocking',
    done: p.treatmentPlanCount > 0,
    target: 'plans',
  });

  if (p.treatmentPlanCount > 0) {
    steps.push({
      id: 'approval',
      label: 'Get the plan approved by the patient',
      why:
        p.approvedPlanCount > 0
          ? 'Approved.'
          : 'A plan nobody has agreed to is a quote. Treating from it, or booking a flight around it, is done on an assumption.',
      severity: 'blocking',
      done: p.approvedPlanCount > 0,
      target: 'plans',
    });
  }

  // Only once there is something to book, and not offered again after treatment has happened.
  if (p.treatmentPlanCount > 0 && p.pastAppointmentCount === 0) {
    steps.push({
      id: 'appointment',
      label: 'Book the first appointment',
      why:
        p.upcomingAppointmentCount > 0
          ? `${p.upcomingAppointmentCount} booked.`
          : 'An approved plan with no chair time is the commonest way a case stalls — everyone assumes somebody else booked it.',
      severity: 'blocking',
      done: p.upcomingAppointmentCount > 0,
      target: 'appointments',
    });
  }

  // ── Admin. Real, and none of it is urgent next to the above. ──────────────────────────────────
  if (p.upcomingAppointmentCount > 0 || p.pastAppointmentCount > 0) {
    steps.push({
      id: 'passport',
      label: 'Collect a passport copy',
      why: p.hasPassportOnFile
        ? 'On file.'
        : 'Needed for the hotel and the clinic’s own records, and it is easier to ask for before somebody boards than after they land.',
      severity: 'admin',
      done: p.hasPassportOnFile,
      target: 'files',
    });
  }

  if (p.approvedPlanCount > 0) {
    steps.push({
      id: 'invoice',
      label: 'Raise an invoice',
      why:
        p.invoiceCount > 0
          ? p.fullyPaid
            ? 'Raised and settled.'
            : 'Raised, not fully paid.'
          : 'Work has been agreed and nothing has been billed for it.',
      severity: 'admin',
      done: p.invoiceCount > 0,
      target: 'finance',
    });
  }

  if (p.pastAppointmentCount > 0) {
    steps.push({
      id: 'warranty',
      label: 'Issue the warranty',
      why:
        p.warrantyCount > 0
          ? 'Issued.'
          : 'Treatment has happened and no warranty has been issued. It is the document patients ask for months later, when reconstructing it is hardest.',
      severity: 'admin',
      done: p.warrantyCount > 0,
      target: 'plans',
    });

    steps.push({
      id: 'aftercare',
      label: 'Move them into aftercare',
      why: present(p.aftercareStartedAt)
        ? 'In aftercare.'
        : 'Treatment is done but the record still reads as in-progress, so they drop out of both the selling list and the follow-up list.',
      severity: 'admin',
      done: present(p.aftercareStartedAt),
      target: 'overview',
    });
  }

  return steps;
}

const SEVERITY_RANK: Record<StepSeverity, number> = { safety: 0, blocking: 1, admin: 2 };

export interface PatientGuidance {
  steps: PatientStep[];
  /** What to do now. Null when nothing is outstanding. */
  nextStep: PatientStep | null;
  outstanding: PatientStep[];
  counts: { safety: number; blocking: number; admin: number; done: number; total: number };
  /** 0–100, for a progress indicator. Rounded down so 99% never renders as complete. */
  completeness: number;
}

export function patientGuidance(snapshot: PatientSnapshot): PatientGuidance {
  const steps = patientSteps(snapshot);
  const outstanding = steps
    .filter((s) => !s.done)
    // Stable within a severity: the order they were pushed is the order they should be worked in.
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const done = steps.filter((s) => s.done).length;

  return {
    steps,
    nextStep: outstanding[0] ?? null,
    outstanding,
    counts: {
      safety: outstanding.filter((s) => s.severity === 'safety').length,
      blocking: outstanding.filter((s) => s.severity === 'blocking').length,
      admin: outstanding.filter((s) => s.severity === 'admin').length,
      done,
      total: steps.length,
    },
    // Floored, so a record one step short never shows as finished.
    completeness: steps.length === 0 ? 100 : Math.floor((done / steps.length) * 100),
  };
}
