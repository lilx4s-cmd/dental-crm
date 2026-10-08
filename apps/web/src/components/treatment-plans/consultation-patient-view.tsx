'use client';

import { useState } from 'react';
import { consultationCopy, consultationTotals, consultationItinerary, consultationWarnings, consultationPresentationCopy, consultationQuotedPayment, consultationVisitBreakdown, consultationVisitPurpose, consultationTreatmentSummary, consultationBrandPalette, type Consultation, type ConsultationCopyKey, type ConsultationPaymentTerms, type ConsultationIdentity, type ConsultationChartMode } from '@dental-crm/shared';
import { ConsultationChart, TreatmentProcess } from './consultation-chart';
export interface ConsultationPatientViewProps {
  plan: Consultation;
  coverPhoto?: string | null;
  payment?: ConsultationPaymentTerms;
  identity?: Partial<ConsultationIdentity>;
  clinic?: {
    clinicName: string;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  };
  patientName?: string;
  preparedAt?: string;
  reference?: string;
}
export function ConsultationPatientView({
  plan,
  coverPhoto,
  payment,
  identity,
  clinic,
  patientName,
  preparedAt,
  reference
}: ConsultationPatientViewProps) {
  const [chartMode, setChartMode] = useState<ConsultationChartMode>('proposed');
  const t = consultationCopy(plan.language),
    p = consultationPresentationCopy(plan.language);
  const totals = consultationTotals(plan),
    quote = consultationQuotedPayment(plan, payment);
  const money = (value: number) => <bdi dir="ltr">{plan.currency} {new Intl.NumberFormat(plan.language, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)}</bdi>;
  const price = (value: number, unpriced: boolean) => unpriced ? p.toQuote : money(value);
  const hasOptions = payment?.cardFee != null || payment?.cashDiscount != null;
  const hasDeposit = payment?.depositAmount != null || payment?.depositPercent != null;
  const {
    accent,
    onAccent,
    heading
  } = consultationBrandPalette(identity?.accentColor);
  const logo = identity?.logo || clinic?.logoUrl;
  return <article className="consultation-document min-w-0 space-y-6 bg-white text-slate-800" dir={plan.language === 'ar' ? 'rtl' : 'ltr'}>
      {(clinic || patientName) && <header className="space-y-2 border-b pb-4">
        {logo && <img src={logo} alt={clinic?.clinicName ?? ''} className="h-12 max-w-44 object-contain" />}
        {clinic && <><h2 className="text-xl font-semibold" style={{
          color: heading
        }}>{clinic.clinicName}</h2><p className="break-words text-xs text-slate-500">{[clinic.address, clinic.phone, clinic.email, clinic.website].filter(Boolean).join(' · ')}</p></>}
        {patientName && <p className="font-medium">{t.patient}: {patientName}</p>}
        {(preparedAt || reference) && <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {preparedAt && <span>{p.prepared}: <bdi>{new Intl.DateTimeFormat(plan.language, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC'
            }).format(new Date(preparedAt))}</bdi></span>}
          {reference && <span>{p.reference}: <bdi dir="ltr">{reference}</bdi></span>}
        </p>}
      </header>}
      <img src={coverPhoto || '/images/clinic-cover.jpg'} alt="" className="h-36 w-full rounded-2xl object-cover sm:h-52" />
      <section className="space-y-4 rounded-2xl p-5 sm:p-6" style={{
      backgroundColor: accent,
      color: onAccent
    }}>
        <p className="text-sm opacity-90">{p.estimate}</p>
        <h2 className="whitespace-pre-wrap break-words text-xl font-semibold leading-relaxed sm:text-2xl">{consultationTreatmentSummary(plan)}</h2>
        <div className="border-t border-white/25 pt-4">
          <p className="text-sm opacity-90">{t.total}</p>
          <p className="mt-1 text-2xl font-semibold sm:text-3xl">{price(totals.total, totals.unpriced)}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">{totals.visits.map(visit => <div className="rounded-xl bg-white/10 p-3" key={visit.number}>
          <p className="text-sm opacity-90">{t.visit} {visit.number}</p><p className="font-semibold">{price(visit.total, visit.unpriced)}</p>
        </div>)}</div>
      </section>
      <p className="text-sm leading-relaxed text-slate-600">{t.confirmation}</p>
      {consultationWarnings(plan).filter(key => key !== 'unpriced').map(key => <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" key={key}>{t[key as ConsultationCopyKey]}</p>)}
      <div className="flex flex-wrap gap-2" aria-label={t.assessment}>
        {(['proposed', 'recorded'] as const).map(mode => <button key={mode} type="button" aria-pressed={chartMode === mode} onClick={() => setChartMode(mode)} className={`min-h-11 rounded-full border px-4 text-sm ${chartMode === mode ? 'border-slate-800 bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>{p[mode]}</button>)}
      </div>
      {plan.visits.map(visit => {
      const breakdown = consultationVisitBreakdown(plan, visit.number);
      return <section key={visit.number} className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="text-xl font-semibold" style={{
              color: heading
            }}>{t.visit} {visit.number}</h3>
              <p className="mt-1 text-sm text-slate-600">{consultationVisitPurpose(plan, visit.number)}</p>
              <p className="mt-2 text-xs text-slate-500">{p.days}: {visit.treatmentDays ?? p.durationPending} · {t.hotel}: {visit.nights} {t.nights}</p>
            </div>
            <div><p className="text-xs text-slate-500">{p.visitFee}</p><p className="text-lg font-semibold">{price(breakdown.total, breakdown.unpriced)}</p></div>
          </header>
          <ConsultationChart plan={plan} visit={visit.number} mode={chartMode} />
          <div className="overflow-x-auto rounded-xl border" tabIndex={0} role="region" aria-label={`${t.visit} ${visit.number} · ${t.prices}`}>
            <table className="w-full min-w-[420px] text-start text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>{[t.treatment, t.quantity, t.unitPrice, t.discount, p.amount].map((label, index) => <th className={`p-3 font-medium ${index === 0 ? 'text-start' : 'text-end'}`} key={index}>{label}</th>)}</tr></thead>
              <tbody>{plan.lines.filter(line => line.visit === visit.number).map(line => <tr key={line.id} className="border-t align-top">
                <td className="p-3"><p className="font-medium">{t[line.type]}</p>
                  {(line.material || line.brand) && <p className="mt-1 break-words text-xs text-slate-500">{[line.material, line.brand].filter(Boolean).join(' · ')}</p>}
                  <p className="mt-1 text-xs text-slate-500">{line.positions.length ? <bdi dir="ltr">FDI {line.positions.join(', ')}</bdi> : p.positionsPending}</p>
                </td>
                <td className="p-3 text-end">{line.quantity}</td><td className="whitespace-nowrap p-3 text-end">{line.unitPrice == null ? p.toQuote : money(line.unitPrice)}</td>
                <td className="whitespace-nowrap p-3 text-end">{line.discount ? money(line.discount) : '—'}</td>
                <td className="whitespace-nowrap p-3 text-end font-medium">{line.unitPrice == null ? p.toQuote : money(Math.round((line.quantity * line.unitPrice - line.discount) * 100) / 100)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {plan.lines.filter(line => line.visit === visit.number && line.description).map(line => <p key={line.id} className="whitespace-pre-wrap break-words text-sm leading-relaxed"><span className="font-medium">{p.clinicalNote} · {t[line.type]}: </span>{line.description}</p>)}
          <dl className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            {[[t.subtotal, price(breakdown.subtotal, breakdown.unpriced)], [t.discount, money(breakdown.discount)], [`${t.hotel} · ${visit.nights} ${t.nights}`, visit.hotelIncluded ? t.included : money(breakdown.hotel)], [t.transfer, visit.transfer === 'included' ? t.included : visit.transfer === 'excluded' ? t.excluded : money(breakdown.transfer)], [p.visitFee, price(breakdown.total, breakdown.unpriced)]].map(([label, value], index) => <div className={`flex flex-wrap justify-between gap-x-4 gap-y-1 ${index === 4 ? 'border-t pt-2 font-semibold' : ''}`} key={index}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <h4 className="font-semibold">{t.journey}</h4>
          <ol className="grid gap-2 sm:grid-cols-2">{consultationItinerary(plan, visit.number).map(day => <li key={day.day} className="flex gap-3 rounded-xl border p-3 text-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold">{day.day}</span>
            <div className="min-w-0"><p className="text-xs text-slate-500">{t.day} {day.day}</p><p className="break-words">{day.text ?? t[day.key === 'assessment' ? 'assessmentDay' : day.key!]}</p></div>
          </li>)}</ol>
          {visit.number === 1 && plan.visits.length > 1 && <div className="rounded-xl border border-dashed p-4 text-sm leading-relaxed">
            {plan.healing && <p className="font-semibold">{t.healing}: {plan.healing.minMonths}–{plan.healing.maxMonths} {t.months}</p>}
            <p className="mt-1 text-slate-600">{plan.healing && <>{p.healingText} </>}{p.separateVisits}</p>
          </div>}
        </section>;
    })}
      <details className="rounded-2xl border bg-white p-4 sm:p-5"><summary className="cursor-pointer font-semibold">{t.process}</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{[...new Set(plan.lines.map(line => line.type))].map(type => <TreatmentProcess key={type} plan={plan} type={type} />)}</div>
      </details>
      {plan.includedServices.length > 0 && <section className="space-y-2 rounded-2xl bg-slate-50 p-5"><h3 className="font-semibold">{t.included}</h3><ul className="list-inside list-disc space-y-1 text-sm">{plan.includedServices.map((service, index) => <li key={index}>{service}</li>)}</ul></section>}
      {payment && (hasOptions || hasDeposit || payment.terms) && <section className="space-y-3 rounded-2xl border bg-white p-5">
        <h3 className="text-lg font-semibold" style={{
        color: heading
      }}>{t.payment}</h3>
        <dl className="space-y-2 text-sm">
          {hasOptions && <><div className="flex flex-wrap justify-between gap-2"><dt>{p.cashTotal}{payment.cashDiscount ? ` · ${t.cashDiscount} ${payment.cashDiscount}%` : ''}</dt><dd className="font-semibold">{price(quote.cashTotal, totals.unpriced)}</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt>{p.cardTotal}{payment.cardFee ? ` · ${t.cardFee} ${payment.cardFee}%` : ''}</dt><dd className="font-semibold">{price(quote.cardTotal, totals.unpriced)}</dd></div>
            {!!payment.cardFee && <div className="flex flex-wrap justify-between gap-2 text-slate-600"><dt>{p.cardExtra}</dt><dd>{price(quote.cardExtra, totals.unpriced)}</dd></div>}</>}
          {hasDeposit && <><div className="flex flex-wrap justify-between gap-2 border-t pt-3"><dt>{p.depositRequested}</dt><dd>{price(quote.deposit, totals.unpriced)}</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt>{p.remainingCash}</dt><dd>{price(quote.remaining, totals.unpriced)}</dd></div>
            {!!payment.cardFee && <div className="flex flex-wrap justify-between gap-2"><dt>{p.remainingCard}</dt><dd>{price(Math.round((quote.cardTotal - quote.deposit) * 100) / 100, totals.unpriced)}</dd></div>}</>}
        </dl>
        {payment.terms && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{payment.terms}</p>}
        <p className="text-xs leading-relaxed text-slate-500">{p.quoteOnly}</p>
      </section>}
      {identity?.warranties?.some(warranty => plan.lines.some(line => line.type === warranty.type)) && <section className="space-y-2 rounded-2xl border p-5">
        <h3 className="font-semibold">{t.warranty}</h3>{identity.warranties.filter(warranty => plan.lines.some(line => line.type === warranty.type)).map(warranty => <p className="whitespace-pre-wrap text-sm" key={warranty.type}>{t[warranty.type]}: {warranty.summary}</p>)}<p className="text-xs text-slate-500">{t.contractual}</p>
      </section>}
      <section className="space-y-2 rounded-2xl bg-slate-50 p-5"><h3 className="text-lg font-semibold" style={{
        color: heading
      }}>{p.nextSteps}</h3><p className="text-sm leading-relaxed">{p.nextStepText}</p>{clinic?.email && <p className="text-sm"><bdi>{clinic.email}</bdi>{clinic.phone && <> · <bdi>{clinic.phone}</bdi></>}</p>}</section>
      <footer className="space-y-2 border-t pt-4 text-sm">
        <div className="flex flex-wrap items-center gap-4">{identity?.signature && <img src={identity.signature} alt={t.signature} className="h-12 max-w-40 object-contain" />}{identity?.stamp && <img src={identity.stamp} alt="" className="h-16 w-16 object-contain" />}</div>
        <p className="font-semibold">{identity?.department && identity.department !== 'International Patient Department' ? identity.department : t.department}</p>
        {identity?.representative && <p>{identity.representative}</p>}
      </footer>
    </article>;
}
