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
/**
 * The full list, in the order it should be worked through.
 *
 * Steps that are already done stay in the list rather than disappearing. A checklist that empties
 * itself gives no sense of where a patient is in their journey, and somebody arriving at a record
 * mid-treatment needs to see what has been covered as much as what has not.
 */
export declare function patientSteps(p: PatientSnapshot): PatientStep[];
export interface PatientGuidance {
    steps: PatientStep[];
    /** What to do now. Null when nothing is outstanding. */
    nextStep: PatientStep | null;
    outstanding: PatientStep[];
    counts: {
        safety: number;
        blocking: number;
        admin: number;
        done: number;
        total: number;
    };
    /** 0–100, for a progress indicator. Rounded down so 99% never renders as complete. */
    completeness: number;
}
export declare function patientGuidance(snapshot: PatientSnapshot): PatientGuidance;
//# sourceMappingURL=next-steps.d.ts.map