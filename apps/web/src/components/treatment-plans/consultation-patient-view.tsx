'use client';
import {
  consultationCopy,
  consultationTotals,
  consultationItinerary,
  consultationWarnings,
  type Consultation,
  type ConsultationCopyKey,
} from '@dental-crm/shared';
import { ConsultationChart, TreatmentProcess } from './consultation-chart';
export function ConsultationPatientView({
  plan,
  coverPhoto,
}: {
  plan: Consultation;
  coverPhoto?: string | null;
}) {
  const t = consultationCopy(plan.language),
    totals = consultationTotals(plan);
  const money = (n: number) =>
    new Intl.NumberFormat(plan.language, { style: 'currency', currency: plan.currency }).format(n);
  return (
    <div className="consultation-document space-y-6" dir={plan.language === 'ar' ? 'rtl' : 'ltr'}>
      <img
        src={coverPhoto || '/images/clinic-cover.jpg'}
        alt=""
        className="h-44 w-full rounded-2xl object-cover sm:h-64"
      />
      <h2 className="text-2xl font-semibold">{t.plan}</h2>
      <p className="text-sm text-muted-foreground">{t.confirmation}</p>
      {consultationWarnings(plan).map((key) => (
        <p className="rounded-lg border p-3 text-sm" key={key}>
          {t[key as ConsultationCopyKey]}
        </p>
      ))}
      {plan.visits.map((v) => (
        <section key={v.number} className="space-y-3 rounded-2xl border bg-background p-5">
          <h3 className="text-xl font-semibold">
            {t.visit} {v.number}
          </h3>
          <ConsultationChart plan={plan} visit={v.number} />
          {plan.lines
            .filter((l) => l.visit === v.number)
            .map((l) => (
              <p key={l.id}>
                {l.quantity} × {t[l.type]} {l.material} {l.brand}{' '}
                {l.positions.length ? ' · FDI ' + l.positions.join(', ') : ' · ' + t.unassigned}
              </p>
            ))}
          <div className="grid gap-2 sm:grid-cols-2">
            {consultationItinerary(plan, v.number).map((d) => (
              <p className="rounded-lg bg-muted p-3 text-sm" key={d.day}>
                {t.day} {d.day} · {d.text ?? t[d.key === 'assessment' ? 'assessmentDay' : d.key!]}
              </p>
            ))}
          </div>
          <p>
            {t.hotel}: {v.nights} {t.nights} ·{' '}
            {v.hotelIncluded ? t.included : money(v.hotelRate * v.nights)}
          </p>
          <p>
            {t.transfer}:{' '}
            {
              t[
                v.transfer === 'paid' ? 'paid' : v.transfer === 'included' ? 'included' : 'excluded'
              ]
            }
          </p>
          <p className="text-lg font-semibold">
            {t.total}:{' '}
            {totals.visits.find((p) => p.number === v.number)?.unpriced
              ? t.unpriced
              : money(totals.visits.find((p) => p.number === v.number)!.total)}
          </p>
          {v.number === 1 && plan.visits.length > 1 && plan.healing && (
            <p>
              {t.healing}: {plan.healing.minMonths}-{plan.healing.maxMonths} {t.months}
            </p>
          )}
        </section>
      ))}
      <h3 className="text-xl font-semibold">{t.process}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {[...new Set(plan.lines.map((l) => l.type))].map((type) => (
          <TreatmentProcess key={type} plan={plan} type={type} />
        ))}
      </div>
      <p className="text-2xl font-semibold">
        {t.investment}: {totals.unpriced ? t.unpriced : money(totals.total)}
      </p>
      {plan.includedServices.length > 0 && (
        <section>
          <h3 className="font-semibold">{t.included}</h3>
          {plan.includedServices.map((s) => (
            <p key={s} className="text-sm">
              {s}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
