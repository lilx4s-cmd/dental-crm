'use client';

import { format } from 'date-fns';
import { ClipboardList, Paperclip, ShieldCheck } from 'lucide-react';
import type { LeadIntakeSubmission } from '@/hooks/use-leads';

/**
 * What the patient declared on the public enquiry form.
 *
 * Read-only on purpose. This is a record of what somebody said about their own health at a point
 * in time; staff correct and enrich the *lead* as they learn more, and that editing must never
 * silently rewrite the original declaration.
 */
export function IntakeAnswers({ submission }: { submission: LeadIntakeSubmission }) {
  // "Did not answer" is rendered as such rather than as "No" — an unanswered smoking question is
  // not a non-smoker, and the surgery needs to see the difference.
  const yesNo = (v: boolean | null) => (v === null ? 'Not answered' : v ? 'Yes' : 'No');

  const medical: [string, string | null][] = [
    ['Allergies', submission.allergies],
    ['Medication', submission.medications],
    ['Conditions', submission.medicalConditions],
    ['Previous surgery', submission.previousSurgeries],
  ];

  const flags: [string, boolean | null][] = [
    ['Smokes', submission.isSmoker],
    ['Drinks alcohol', submission.drinksAlcohol],
    ['Pregnant', submission.isPregnant],
    ['Blood thinners', submission.takesBloodThinners],
  ];

  const about: [string, string | null][] = [
    ['Date of birth', submission.dateOfBirth ? format(new Date(submission.dateOfBirth), 'd MMM yyyy') : null],
    ['Gender', submission.gender],
    ['Nationality', submission.nationality],
    ['Lives in', submission.countryOfResidence],
    ['Language', submission.preferredLanguage],
    [
      'Height / weight',
      [submission.heightCm ? `${submission.heightCm} cm` : null, submission.weightKg ? `${submission.weightKg} kg` : null]
        .filter(Boolean)
        .join(' · ') || null,
    ],
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardList className="h-4 w-4" /> Enquiry form
        </h3>
        <span className="text-xs text-muted-foreground">
          {format(new Date(submission.createdAt), 'd MMM yyyy')}
        </span>
      </div>

      {submission.treatmentInterest.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {submission.treatmentInterest.map((t) => (
            <span key={t} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {t}
            </span>
          ))}
        </div>
      )}

      {submission.chiefComplaint && (
        <div className="rounded-md border-l-2 border-primary/40 bg-muted/30 px-3 py-2">
          <p className="text-xs font-semibold text-muted-foreground">Main concern</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{submission.chiefComplaint}</p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {about
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        {submission.desiredTimeframe && (
          <div>
            <dt className="text-muted-foreground">Timeframe</dt>
            <dd>{submission.desiredTimeframe}</dd>
          </div>
        )}
        {submission.openToTravel !== null && (
          <div>
            <dt className="text-muted-foreground">Will travel</dt>
            <dd>{yesNo(submission.openToTravel)}</dd>
          </div>
        )}
      </dl>

      <div className="rounded-md border p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Medical history</p>

        <div className="flex flex-wrap gap-1.5">
          {flags.map(([label, value]) => (
            <span
              key={label}
              className={
                value === null
                  ? 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                  : value
                    ? 'rounded-full bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning-muted-foreground'
                    : 'rounded-full bg-muted px-2 py-0.5 text-xs'
              }
            >
              {label}: {yesNo(value)}
            </span>
          ))}
        </div>

        <dl className="mt-3 space-y-2 text-xs">
          {medical.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap">{value?.trim() ? value : 'Not answered'}</dd>
            </div>
          ))}
        </dl>
      </div>

      {submission.additionalNotes && (
        <div>
          <p className="text-xs text-muted-foreground">Anything else</p>
          <p className="whitespace-pre-wrap text-sm">{submission.additionalNotes}</p>
        </div>
      )}

      {submission.attachments.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Attachments</p>
          <ul className="space-y-1">
            {submission.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-xs">
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
                <span className="shrink-0 text-muted-foreground">
                  {(a.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3 w-3" />
        Consent given {format(new Date(submission.consentedAt), 'd MMM yyyy, HH:mm')}
      </p>
    </div>
  );
}
