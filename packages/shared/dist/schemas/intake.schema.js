"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTAKE_COPY = exports.INTAKE_MAX_FILES = exports.INTAKE_MAX_FILE_BYTES = exports.INTAKE_ALLOWED_MIME_TYPES = exports.IntakeSubmissionSchema = exports.INTAKE_CONSENT_TEXT = exports.TIMEFRAMES = exports.TREATMENT_INTERESTS = void 0;
exports.hasContactMethod = hasContactMethod;
const zod_1 = require("zod");
// The public intake form's contract and its wording, in one place. The browser validates against
// this before submitting and the API validates against it again on arrival, so a field cannot mean
// one thing to the form and another to the server.
//
// Copy lives here rather than inline in JSX so a second language is a second COPY object rather
// than a rewrite of the form. Question wording is part of the contract for a medical questionnaire:
// what was asked matters as much as what was answered.
/** What the clinic offers, as a patient would describe it. */
exports.TREATMENT_INTERESTS = [
    'Dental implants',
    'Crowns or bridges',
    'Veneers',
    'Whitening',
    'Braces or aligners',
    'Root canal',
    'Extraction',
    'Cleaning and gum treatment',
    'Full-mouth rehabilitation',
    'Not sure — I need advice',
];
exports.TIMEFRAMES = [
    'As soon as possible',
    'Within a month',
    'In 1–3 months',
    'In 3–6 months',
    'Just researching for now',
];
/**
 * The exact consent wording shown to the patient. Persisted with each submission, so changing this
 * text later cannot retroactively alter what somebody already agreed to.
 */
exports.INTAKE_CONSENT_TEXT = 'I confirm the information above is accurate to the best of my knowledge. I understand this ' +
    'form is an enquiry and not a diagnosis, and that no treatment has been agreed. I consent to ' +
    'the clinic storing and processing the health information I have provided so it can advise me ' +
    'on treatment and contact me about my enquiry.';
/**
 * Tri-state answers. A medical question left blank is not the same as a "no" — an unanswered
 * smoking question must never be recorded as a non-smoker — so the form offers an explicit
 * "prefer not to say"/unanswered state and the schema keeps it as undefined.
 */
const triStateBoolean = zod_1.z
    .union([zod_1.z.boolean(), zod_1.z.literal('yes'), zod_1.z.literal('no'), zod_1.z.literal('')])
    .optional()
    .transform((v) => {
    if (v === '' || v === undefined)
        return undefined;
    if (typeof v === 'boolean')
        return v;
    return v === 'yes';
});
const optionalText = zod_1.z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === '' ? undefined : v));
exports.IntakeSubmissionSchema = zod_1.z.object({
    // Contact. Only a name is truly required — demanding an email from someone who only uses
    // WhatsApp loses the enquiry, so the schema requires that at least one way to reach them exists.
    firstName: zod_1.z.string().trim().min(1, 'Please tell us your first name').max(100),
    lastName: zod_1.z.string().trim().min(1, 'Please tell us your last name').max(100),
    email: zod_1.z.string().trim().email('That does not look like an email address').optional().or(zod_1.z.literal('')),
    phone: optionalText,
    whatsappNumber: optionalText,
    dateOfBirth: zod_1.z.string().optional().or(zod_1.z.literal('')),
    gender: zod_1.z.enum(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']).optional().or(zod_1.z.literal('')),
    nationality: optionalText,
    countryOfResidence: optionalText,
    preferredLanguage: optionalText,
    // What they want.
    treatmentInterest: zod_1.z.array(zod_1.z.string().max(100)).max(20).optional(),
    chiefComplaint: optionalText,
    desiredTimeframe: optionalText,
    openToTravel: triStateBoolean,
    // Medical history.
    allergies: optionalText,
    medications: optionalText,
    medicalConditions: optionalText,
    previousSurgeries: optionalText,
    isSmoker: triStateBoolean,
    drinksAlcohol: triStateBoolean,
    isPregnant: triStateBoolean,
    takesBloodThinners: triStateBoolean,
    heightCm: zod_1.z.coerce.number().int().min(50).max(260).optional(),
    weightKg: zod_1.z.coerce.number().int().min(20).max(400).optional(),
    additionalNotes: optionalText,
    consentGiven: zod_1.z.literal(true, {
        errorMap: () => ({ message: 'We cannot accept the form without your consent' }),
    }),
    sourceUrl: optionalText,
    utmSource: optionalText,
    utmMedium: optionalText,
    utmCampaign: optionalText,
    // Honeypot. Real people never see this field, so anything in it came from a bot.
    website: zod_1.z.string().max(200).optional(),
});
/** At least one way to reach the patient, checked separately so the message lands on the form. */
function hasContactMethod(v) {
    return Boolean(v.email?.trim() || v.phone?.trim() || v.whatsappNumber?.trim());
}
/** Attachments the form accepts. Kept narrow because this endpoint is unauthenticated. */
exports.INTAKE_ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/webp',
    'application/pdf',
];
exports.INTAKE_MAX_FILE_BYTES = 15 * 1024 * 1024;
exports.INTAKE_MAX_FILES = 10;
exports.INTAKE_COPY = {
    title: 'Patient enquiry form',
    intro: 'Tell us a little about yourself and what you would like treated. It takes about five minutes, ' +
        'and it means your coordinator can give you useful advice on the first call instead of asking ' +
        'these questions then.',
    sections: {
        about: 'About you',
        wants: 'What you are looking for',
        medical: 'Your medical history',
        photos: 'Photos or x-rays',
        consent: 'Consent',
    },
    fields: {
        firstName: 'First name',
        lastName: 'Last name',
        email: 'Email',
        phone: 'Phone',
        whatsappNumber: 'WhatsApp number',
        dateOfBirth: 'Date of birth',
        gender: 'Gender',
        nationality: 'Nationality',
        countryOfResidence: 'Country you live in',
        preferredLanguage: 'Language you prefer',
        treatmentInterest: 'What are you interested in?',
        chiefComplaint: 'What is bothering you most?',
        desiredTimeframe: 'When would you like treatment?',
        openToTravel: 'Are you willing to travel to us for treatment?',
        allergies: 'Do you have any allergies?',
        medications: 'Are you taking any medication?',
        medicalConditions: 'Do you have any medical conditions?',
        previousSurgeries: 'Have you had any previous surgery?',
        isSmoker: 'Do you smoke?',
        drinksAlcohol: 'Do you drink alcohol?',
        isPregnant: 'Are you pregnant?',
        takesBloodThinners: 'Do you take blood thinners?',
        heightCm: 'Height (cm)',
        weightKg: 'Weight (kg)',
        additionalNotes: 'Anything else we should know?',
    },
    hints: {
        contact: 'Give us at least one way to reach you — email, phone or WhatsApp.',
        medical: 'These questions affect how safely we can treat you. If you are not sure about something, ' +
            'leave it blank and tell us on the call — a guess is worse than no answer.',
        allergies: 'Medicines, latex, anaesthetic — anything you know of.',
        bloodThinners: 'For example warfarin, aspirin taken daily, apixaban or clopidogrel.',
        photos: 'A photo of your smile and any recent x-ray helps the dentist give you a realistic answer. ' +
            'This is optional.',
        unanswered: 'Leave blank if you would rather not say',
    },
    submit: 'Send my enquiry',
    submitting: 'Sending…',
    success: {
        title: 'Thank you — we have your enquiry',
        body: 'A treatment coordinator will be in touch shortly. If you need us sooner, reply on WhatsApp.',
        uploadFailed: 'Your enquiry was received, but we could not upload your photos. Please send them to your ' +
            'coordinator on WhatsApp instead.',
    },
};
//# sourceMappingURL=intake.schema.js.map