'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Paperclip, ShieldCheck, X } from 'lucide-react';
import {
  INTAKE_ALLOWED_MIME_TYPES,
  INTAKE_CONSENT_TEXT,
  INTAKE_COPY,
  INTAKE_MAX_FILES,
  INTAKE_MAX_FILE_BYTES,
  TIMEFRAMES,
  TREATMENT_INTERESTS,
} from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { uploadIntakeFiles, useSubmitIntake } from '@/hooks/use-intake';

const C = INTAKE_COPY;

/** Answers a medical yes/no question, with "not answered" as a real, distinct third state. */
type TriState = '' | 'yes' | 'no';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  countryOfResidence: string;
  preferredLanguage: string;
  treatmentInterest: string[];
  chiefComplaint: string;
  desiredTimeframe: string;
  openToTravel: TriState;
  allergies: string;
  medications: string;
  medicalConditions: string;
  previousSurgeries: string;
  isSmoker: TriState;
  drinksAlcohol: TriState;
  isPregnant: TriState;
  takesBloodThinners: TriState;
  heightCm: string;
  weightKg: string;
  additionalNotes: string;
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  whatsappNumber: '',
  dateOfBirth: '',
  gender: '',
  nationality: '',
  countryOfResidence: '',
  preferredLanguage: '',
  treatmentInterest: [],
  chiefComplaint: '',
  desiredTimeframe: '',
  openToTravel: '',
  allergies: '',
  medications: '',
  medicalConditions: '',
  previousSurgeries: '',
  isSmoker: '',
  drinksAlcohol: '',
  isPregnant: '',
  takesBloodThinners: '',
  heightCm: '',
  weightKg: '',
  additionalNotes: '',
};

const text = (v: string) => (v.trim() === '' ? undefined : v.trim());
const tri = (v: TriState) => (v === '' ? undefined : v === 'yes');
const int = (v: string) => (v.trim() === '' ? undefined : parseInt(v, 10));

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * A medical yes/no. Rendered as three explicit choices rather than a checkbox, because a checkbox
 * cannot distinguish "no" from "not answered" — and recording an unanswered smoking question as
 * "non-smoker" is exactly the kind of wrong answer that reaches the surgery.
 */
function YesNo({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: TriState;
  onChange: (v: TriState) => void;
  hint?: string;
}) {
  const options: { value: TriState; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: '', label: 'Prefer not to say' },
  ];

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              value === o.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function IntakeForm() {
  const submit = useSubmitIntake();
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ uploadFailed: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const toggleInterest = (interest: string) =>
    setForm((f) => ({
      ...f,
      treatmentInterest: f.treatmentInterest.includes(interest)
        ? f.treatmentInterest.filter((i) => i !== interest)
        : [...f.treatmentInterest, interest],
    }));

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next: File[] = [];
    for (const file of Array.from(incoming)) {
      if (!(INTAKE_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) continue;
      if (file.size > INTAKE_MAX_FILE_BYTES) continue;
      next.push(file);
    }
    setFiles((prev) => [...prev, ...next].slice(0, INTAKE_MAX_FILES));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = 'Please tell us your first name';
    if (!form.lastName.trim()) next.lastName = 'Please tell us your last name';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()))
      next.email = 'That does not look like an email address';
    if (!form.email.trim() && !form.phone.trim() && !form.whatsappNumber.trim())
      next.contact = C.hints.contact;
    if (!consent) next.consent = 'We cannot accept the form without your consent';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      // Send focus to the problem rather than leaving people hunting for red text.
      document.querySelector<HTMLElement>('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const result = await submit.mutateAsync({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: text(form.email),
      phone: text(form.phone),
      whatsappNumber: text(form.whatsappNumber),
      dateOfBirth: text(form.dateOfBirth),
      gender: (text(form.gender) as 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN') ?? undefined,
      nationality: text(form.nationality),
      countryOfResidence: text(form.countryOfResidence),
      preferredLanguage: text(form.preferredLanguage),
      treatmentInterest: form.treatmentInterest.length ? form.treatmentInterest : undefined,
      chiefComplaint: text(form.chiefComplaint),
      desiredTimeframe: text(form.desiredTimeframe),
      openToTravel: tri(form.openToTravel),
      allergies: text(form.allergies),
      medications: text(form.medications),
      medicalConditions: text(form.medicalConditions),
      previousSurgeries: text(form.previousSurgeries),
      isSmoker: tri(form.isSmoker),
      drinksAlcohol: tri(form.drinksAlcohol),
      isPregnant: tri(form.isPregnant),
      takesBloodThinners: tri(form.takesBloodThinners),
      heightCm: int(form.heightCm),
      weightKg: int(form.weightKg),
      additionalNotes: text(form.additionalNotes),
      consentGiven: true,
      sourceUrl: typeof window === 'undefined' ? undefined : window.location.href,
      website: honeypot || undefined,
    });

    // The enquiry is saved by this point. Photos are best-effort on top of it, never a condition
    // of it — a storage outage costs the clinic some images, not the patient's enquiry.
    let uploadFailed = false;
    if (files.length > 0 && result.submissionId && result.uploadToken) {
      setUploading(true);
      const { failed } = await uploadIntakeFiles(result.submissionId, result.uploadToken, files);
      uploadFailed = failed > 0;
      setUploading(false);
    }

    setDone({ uploadFailed });
  };

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold">{C.success.title}</h1>
        <p className="mt-2 text-muted-foreground">{C.success.body}</p>
        {done.uploadFailed && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
            {C.success.uploadFailed}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:py-12" noValidate>
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{C.title}</h1>
        <p className="mt-2 text-muted-foreground">{C.intro}</p>
      </header>

      {/* Off-screen rather than display:none — some bots skip hidden fields but fill positioned
          ones. Never shown to a person, so anything in it came from a script. */}
      <div aria-hidden className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <Section title={C.sections.about} hint={C.hints.contact}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={C.fields.firstName} htmlFor="firstName" error={errors.firstName}>
            <Input
              id="firstName"
              data-error={!!errors.firstName}
              value={form.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              autoComplete="given-name"
            />
          </Field>
          <Field label={C.fields.lastName} htmlFor="lastName" error={errors.lastName}>
            <Input
              id="lastName"
              data-error={!!errors.lastName}
              value={form.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
              autoComplete="family-name"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={C.fields.email} htmlFor="email" error={errors.email}>
            <Input
              id="email"
              type="email"
              inputMode="email"
              data-error={!!errors.email}
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              autoComplete="email"
            />
          </Field>
          <Field label={C.fields.phone} htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
              autoComplete="tel"
            />
          </Field>
          <Field label={C.fields.whatsappNumber} htmlFor="whatsapp">
            <Input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              value={form.whatsappNumber}
              onChange={(e) => set({ whatsappNumber: e.target.value })}
            />
          </Field>
          <Field label={C.fields.dateOfBirth} htmlFor="dob">
            <Input id="dob" type="date" value={form.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} />
          </Field>
        </div>

        {errors.contact && <p className="text-sm text-destructive" data-error="true">{errors.contact}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={C.fields.gender} htmlFor="gender">
            <Select value={form.gender} onValueChange={(v) => set({ gender: v })}>
              <SelectTrigger id="gender">
                <SelectValue placeholder={C.hints.unanswered} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={C.fields.countryOfResidence} htmlFor="country">
            <Input id="country" value={form.countryOfResidence} onChange={(e) => set({ countryOfResidence: e.target.value })} autoComplete="country-name" />
          </Field>
          <Field label={C.fields.nationality} htmlFor="nationality">
            <Input id="nationality" value={form.nationality} onChange={(e) => set({ nationality: e.target.value })} />
          </Field>
          <Field label={C.fields.preferredLanguage} htmlFor="language">
            <Input id="language" value={form.preferredLanguage} onChange={(e) => set({ preferredLanguage: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title={C.sections.wants}>
        <div className="space-y-2">
          <p className="text-sm font-medium">{C.fields.treatmentInterest}</p>
          <div className="flex flex-wrap gap-2">
            {TREATMENT_INTERESTS.map((interest) => {
              const active = form.treatmentInterest.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleInterest(interest)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
                  )}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </div>

        <Field label={C.fields.chiefComplaint} htmlFor="complaint">
          <Textarea
            id="complaint"
            rows={3}
            value={form.chiefComplaint}
            onChange={(e) => set({ chiefComplaint: e.target.value })}
          />
        </Field>

        <Field label={C.fields.desiredTimeframe} htmlFor="timeframe">
          <Select value={form.desiredTimeframe} onValueChange={(v) => set({ desiredTimeframe: v })}>
            <SelectTrigger id="timeframe">
              <SelectValue placeholder={C.hints.unanswered} />
            </SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <YesNo
          label={C.fields.openToTravel}
          value={form.openToTravel}
          onChange={(v) => set({ openToTravel: v })}
        />
      </Section>

      <Section title={C.sections.medical} hint={C.hints.medical}>
        <Field label={C.fields.allergies} htmlFor="allergies" hint={C.hints.allergies}>
          <Textarea id="allergies" rows={2} value={form.allergies} onChange={(e) => set({ allergies: e.target.value })} />
        </Field>
        <Field label={C.fields.medications} htmlFor="medications">
          <Textarea id="medications" rows={2} value={form.medications} onChange={(e) => set({ medications: e.target.value })} />
        </Field>
        <Field label={C.fields.medicalConditions} htmlFor="conditions">
          <Textarea id="conditions" rows={2} value={form.medicalConditions} onChange={(e) => set({ medicalConditions: e.target.value })} />
        </Field>
        <Field label={C.fields.previousSurgeries} htmlFor="surgeries">
          <Textarea id="surgeries" rows={2} value={form.previousSurgeries} onChange={(e) => set({ previousSurgeries: e.target.value })} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <YesNo label={C.fields.isSmoker} value={form.isSmoker} onChange={(v) => set({ isSmoker: v })} />
          <YesNo label={C.fields.drinksAlcohol} value={form.drinksAlcohol} onChange={(v) => set({ drinksAlcohol: v })} />
          <YesNo label={C.fields.isPregnant} value={form.isPregnant} onChange={(v) => set({ isPregnant: v })} />
          <YesNo
            label={C.fields.takesBloodThinners}
            value={form.takesBloodThinners}
            onChange={(v) => set({ takesBloodThinners: v })}
            hint={C.hints.bloodThinners}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={C.fields.heightCm} htmlFor="height">
            <Input id="height" type="number" inputMode="numeric" value={form.heightCm} onChange={(e) => set({ heightCm: e.target.value })} />
          </Field>
          <Field label={C.fields.weightKg} htmlFor="weight">
            <Input id="weight" type="number" inputMode="numeric" value={form.weightKg} onChange={(e) => set({ weightKg: e.target.value })} />
          </Field>
        </div>

        <Field label={C.fields.additionalNotes} htmlFor="notes">
          <Textarea id="notes" rows={3} value={form.additionalNotes} onChange={(e) => set({ additionalNotes: e.target.value })} />
        </Field>
      </Section>

      <Section title={C.sections.photos} hint={C.hints.photos}>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-muted/50">
          <Paperclip className="h-4 w-4" />
          Choose photos or x-rays
          <input
            type="file"
            className="sr-only"
            multiple
            accept={INTAKE_ALLOWED_MIME_TYPES.join(',')}
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={C.sections.consent}>
        <label className="flex cursor-pointer items-start gap-3" data-error={!!errors.consent}>
          <Checkbox
            className="mt-0.5"
            checked={consent}
            onCheckedChange={(c) => setConsent(c === true)}
            aria-label="I consent"
          />
          <span className="text-sm leading-relaxed text-muted-foreground">{INTAKE_CONSENT_TEXT}</span>
        </label>
        {errors.consent && <p className="text-xs text-destructive">{errors.consent}</p>}
      </Section>

      {submit.isError && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {submit.error instanceof Error ? submit.error.message : 'Something went wrong. Please try again.'}
        </p>
      )}

      <div className="flex flex-col items-center gap-3 pb-8">
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submit.isPending || uploading}>
          {submit.isPending || uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {C.submitting}
            </>
          ) : (
            C.submit
          )}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Your information is sent securely and seen only by the clinic.
        </p>
      </div>
    </form>
  );
}
