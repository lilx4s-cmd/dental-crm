import { z } from 'zod';
/** What the clinic offers, as a patient would describe it. */
export declare const TREATMENT_INTERESTS: readonly ["Dental implants", "Crowns or bridges", "Veneers", "Whitening", "Braces or aligners", "Root canal", "Extraction", "Cleaning and gum treatment", "Full-mouth rehabilitation", "Not sure — I need advice"];
export declare const TIMEFRAMES: readonly ["As soon as possible", "Within a month", "In 1–3 months", "In 3–6 months", "Just researching for now"];
/**
 * The exact consent wording shown to the patient. Persisted with each submission, so changing this
 * text later cannot retroactively alter what somebody already agreed to.
 */
export declare const INTAKE_CONSENT_TEXT: string;
export declare const IntakeSubmissionSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    phone: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    whatsappNumber: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    dateOfBirth: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    gender: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["MALE", "FEMALE", "OTHER", "UNKNOWN"]>>, z.ZodLiteral<"">]>;
    nationality: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    countryOfResidence: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    preferredLanguage: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    treatmentInterest: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    chiefComplaint: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    desiredTimeframe: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    openToTravel: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodLiteral<"yes">, z.ZodLiteral<"no">, z.ZodLiteral<"">]>>, boolean | undefined, boolean | "" | "yes" | "no" | undefined>;
    allergies: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    medications: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    medicalConditions: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    previousSurgeries: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    isSmoker: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodLiteral<"yes">, z.ZodLiteral<"no">, z.ZodLiteral<"">]>>, boolean | undefined, boolean | "" | "yes" | "no" | undefined>;
    drinksAlcohol: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodLiteral<"yes">, z.ZodLiteral<"no">, z.ZodLiteral<"">]>>, boolean | undefined, boolean | "" | "yes" | "no" | undefined>;
    isPregnant: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodLiteral<"yes">, z.ZodLiteral<"no">, z.ZodLiteral<"">]>>, boolean | undefined, boolean | "" | "yes" | "no" | undefined>;
    takesBloodThinners: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodLiteral<"yes">, z.ZodLiteral<"no">, z.ZodLiteral<"">]>>, boolean | undefined, boolean | "" | "yes" | "no" | undefined>;
    heightCm: z.ZodOptional<z.ZodNumber>;
    weightKg: z.ZodOptional<z.ZodNumber>;
    additionalNotes: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    consentGiven: z.ZodLiteral<true>;
    sourceUrl: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    utmSource: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    utmMedium: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    utmCampaign: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    website: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    firstName: string;
    lastName: string;
    consentGiven: true;
    email?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    dateOfBirth?: string | undefined;
    gender?: "" | "OTHER" | "MALE" | "FEMALE" | "UNKNOWN" | undefined;
    website?: string | undefined;
    preferredLanguage?: string | undefined;
    nationality?: string | undefined;
    countryOfResidence?: string | undefined;
    treatmentInterest?: string[] | undefined;
    chiefComplaint?: string | undefined;
    desiredTimeframe?: string | undefined;
    openToTravel?: boolean | undefined;
    allergies?: string | undefined;
    medications?: string | undefined;
    medicalConditions?: string | undefined;
    previousSurgeries?: string | undefined;
    isSmoker?: boolean | undefined;
    drinksAlcohol?: boolean | undefined;
    isPregnant?: boolean | undefined;
    takesBloodThinners?: boolean | undefined;
    heightCm?: number | undefined;
    weightKg?: number | undefined;
    additionalNotes?: string | undefined;
    sourceUrl?: string | undefined;
    utmSource?: string | undefined;
    utmMedium?: string | undefined;
    utmCampaign?: string | undefined;
}, {
    firstName: string;
    lastName: string;
    consentGiven: true;
    email?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    dateOfBirth?: string | undefined;
    gender?: "" | "OTHER" | "MALE" | "FEMALE" | "UNKNOWN" | undefined;
    website?: string | undefined;
    preferredLanguage?: string | undefined;
    nationality?: string | undefined;
    countryOfResidence?: string | undefined;
    treatmentInterest?: string[] | undefined;
    chiefComplaint?: string | undefined;
    desiredTimeframe?: string | undefined;
    openToTravel?: boolean | "" | "yes" | "no" | undefined;
    allergies?: string | undefined;
    medications?: string | undefined;
    medicalConditions?: string | undefined;
    previousSurgeries?: string | undefined;
    isSmoker?: boolean | "" | "yes" | "no" | undefined;
    drinksAlcohol?: boolean | "" | "yes" | "no" | undefined;
    isPregnant?: boolean | "" | "yes" | "no" | undefined;
    takesBloodThinners?: boolean | "" | "yes" | "no" | undefined;
    heightCm?: number | undefined;
    weightKg?: number | undefined;
    additionalNotes?: string | undefined;
    sourceUrl?: string | undefined;
    utmSource?: string | undefined;
    utmMedium?: string | undefined;
    utmCampaign?: string | undefined;
}>;
export type IntakeSubmissionInput = z.input<typeof IntakeSubmissionSchema>;
export type IntakeSubmissionData = z.output<typeof IntakeSubmissionSchema>;
/** At least one way to reach the patient, checked separately so the message lands on the form. */
export declare function hasContactMethod(v: {
    email?: string | null;
    phone?: string | null;
    whatsappNumber?: string | null;
}): boolean;
/** Attachments the form accepts. Kept narrow because this endpoint is unauthenticated. */
export declare const INTAKE_ALLOWED_MIME_TYPES: readonly ["image/jpeg", "image/png", "image/heic", "image/webp", "application/pdf"];
export declare const INTAKE_MAX_FILE_BYTES: number;
export declare const INTAKE_MAX_FILES = 10;
export declare const INTAKE_COPY: {
    readonly title: "Patient enquiry form";
    readonly intro: string;
    readonly sections: {
        readonly about: "About you";
        readonly wants: "What you are looking for";
        readonly medical: "Your medical history";
        readonly photos: "Photos or x-rays";
        readonly consent: "Consent";
    };
    readonly fields: {
        readonly firstName: "First name";
        readonly lastName: "Last name";
        readonly email: "Email";
        readonly phone: "Phone";
        readonly whatsappNumber: "WhatsApp number";
        readonly dateOfBirth: "Date of birth";
        readonly gender: "Gender";
        readonly nationality: "Nationality";
        readonly countryOfResidence: "Country you live in";
        readonly preferredLanguage: "Language you prefer";
        readonly treatmentInterest: "What are you interested in?";
        readonly chiefComplaint: "What is bothering you most?";
        readonly desiredTimeframe: "When would you like treatment?";
        readonly openToTravel: "Are you willing to travel to us for treatment?";
        readonly allergies: "Do you have any allergies?";
        readonly medications: "Are you taking any medication?";
        readonly medicalConditions: "Do you have any medical conditions?";
        readonly previousSurgeries: "Have you had any previous surgery?";
        readonly isSmoker: "Do you smoke?";
        readonly drinksAlcohol: "Do you drink alcohol?";
        readonly isPregnant: "Are you pregnant?";
        readonly takesBloodThinners: "Do you take blood thinners?";
        readonly heightCm: "Height (cm)";
        readonly weightKg: "Weight (kg)";
        readonly additionalNotes: "Anything else we should know?";
    };
    readonly hints: {
        readonly contact: "Give us at least one way to reach you — email, phone or WhatsApp.";
        readonly medical: string;
        readonly allergies: "Medicines, latex, anaesthetic — anything you know of.";
        readonly bloodThinners: "For example warfarin, aspirin taken daily, apixaban or clopidogrel.";
        readonly photos: string;
        readonly unanswered: "Leave blank if you would rather not say";
    };
    readonly submit: "Send my enquiry";
    readonly submitting: "Sending…";
    readonly success: {
        readonly title: "Thank you — we have your enquiry";
        readonly body: "A treatment coordinator will be in touch shortly. If you need us sooner, reply on WhatsApp.";
        readonly uploadFailed: string;
    };
};
//# sourceMappingURL=intake.schema.d.ts.map