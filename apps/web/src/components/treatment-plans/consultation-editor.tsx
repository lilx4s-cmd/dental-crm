'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ConsultationSchema,
  hasPermission,Role,
  DOCUMENT_LANGUAGES,
  PROCEDURES,
  UPPER_TEETH,
  LOWER_TEETH,
  parseConsultation,
  consultationCopy,
  consultationTotals,
  consultationWarnings,
  consultationItinerary,
  type Consultation,
  type ConsultationLine,
  type DocumentConfiguration,
  type ConsultationCopyKey,
} from '@dental-crm/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/auth-context';
import { apiRequest, apiRequestDownload } from '@/lib/api-client';
import { ConsultationChart, TreatmentProcess } from './consultation-chart';
export interface ConsultationSource {
  patient: { id: string; firstName: string; lastName: string };
  config: DocumentConfiguration;
  clinic: { clinicName: string; currency: string };
  preferredLanguage: string;
}
export function ConsultationEditor({
  source,
  initial,
  onClose,
}: {
  source: ConsultationSource;
  initial?: Consultation;
  onClose: () => void;
}) {
  const { accessToken,user } = useAuth(),
    qc = useQueryClient(),
    config = source.config;
  const [plan, setPlan] = useState<Consultation>(
    initial ?? {
      version: 1,
      language: DOCUMENT_LANGUAGES.includes(source.preferredLanguage as Consultation['language'])
        ? (source.preferredLanguage as Consultation['language'])
        : 'en',
      currency: source.clinic.currency,
      treatmentText: '',
      lines: [],
      visits: [],
      healing: config.healing,
      includedServices: config.services,
      findings: {},
    },
  );
  const [input, setInput] = useState(plan.treatmentText),
    [selected, setSelected] = useState<string[]>([]),
    [lineId, setLineId] = useState(''),
    [visit, setVisit] = useState(1),
    [undo, setUndo] = useState<Consultation[]>([]),
    [override, setOverride] = useState<string[]>([]);
  const [pdf, setPdf] = useState<string | null>(null),
    [error, setError] = useState(''),
    [rendering, setRendering] = useState(false),
    pdfRef = useRef<string | null>(null);
  const t = consultationCopy(plan.language),
    totals = consultationTotals(plan),
    valid = ConsultationSchema.safeParse(plan);
  const change = (next: Consultation) => {
    setUndo((h) => [...h.slice(-19), plan]);
    setPlan(next);
  };
  const parse = () => {
    const result = parseConsultation(input, plan.currency, config);
    if (result.warnings.length) {
      toast.error(`${t.treatment}: ${result.warnings.join(', ')}`);
      return;
    }
    const count = Math.max(1, ...result.lines.map((l) => l.visit));
    change({
      ...plan,
      treatmentText: input,
      lines: result.lines,
      visits: Array.from(
        { length: count },
        (_, i) =>
          plan.visits.find((v) => v.number === i + 1) ?? {
            number: i + 1,
            nights: config.defaultNights[i] ?? 0,
            hotelRate: config.defaultHotelRate,
            hotelIncluded: config.defaultHotelIncluded,
            transfer: 'excluded',
            transferPrice: 0,
            itinerary: [],
          },
      ),
    });
    setLineId(result.lines[0]?.id ?? '');
    setVisit(1);
    setSelected([]);
  };
  const lineChange = (id: string, values: Partial<ConsultationLine>) =>
    change({ ...plan, lines: plan.lines.map((l) => (l.id === id ? { ...l, ...values } : l)) });
  useEffect(() => {
    if (!ConsultationSchema.safeParse(plan).success) {
      setRendering(false);
      return;
    }
    const abort = new AbortController();
    setRendering(true);
    setError('');
    const timer = setTimeout(() => {
      void apiRequestDownload(
        '/api/documents/preview',
        {
          method: 'POST',
          body: JSON.stringify({ patientId: source.patient.id, plan }),
          signal: abort.signal,
        },
        accessToken ?? undefined,
      )
        .then(({ blob }) => {
          if (abort.signal.aborted) return;
          if (pdfRef.current) URL.revokeObjectURL(pdfRef.current);
          pdfRef.current = URL.createObjectURL(blob);
          setPdf(pdfRef.current);
          setRendering(false);
        })
        .catch((e) => {
          if (!abort.signal.aborted) {
            setError(e instanceof Error ? e.message : t.preview);
            setRendering(false);
          }
        });
    }, 850);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [plan, source.patient.id, accessToken, t.preview]);
  useEffect(
    () => () => {
      if (pdfRef.current) URL.revokeObjectURL(pdfRef.current);
    },
    [],
  );
  const save = useMutation({
    mutationFn: () =>
      apiRequest(
        '/api/documents/plans',
        { method: 'POST', body: JSON.stringify({ patientId: source.patient.id, plan }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['treatment-plans'] });
      toast.success(t.save);
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t.save),
  });
  const field = (label: string, children: React.ReactNode) => (
    <label className="space-y-1 text-sm">
      <span className="block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !save.isPending) onClose();
      }}
    >
      <DialogContent
        className="consultation-document max-w-7xl"
        dir={plan.language === 'ar' ? 'rtl' : 'ltr'}
      >
        <DialogHeader>
          <DialogTitle>
            {t.plan} · {source.patient.firstName} {source.patient.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {field(
                t.language,
                <select
                  className="h-10 w-full rounded border bg-background px-2"
                  value={plan.language}
                  onChange={(e) =>
                    change({ ...plan, language: e.target.value as Consultation['language'] })
                  }
                >
                  {DOCUMENT_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {new Intl.DisplayNames([l], { type: 'language' }).of(l)}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                t.prices,
                <select
                  className="h-10 w-full rounded border bg-background px-2"
                  value={plan.currency}
                  onChange={(e) => {
                    const currency = e.target.value;
                    change({
                      ...plan,
                      currency,
                      lines: plan.lines.map((l) => ({
                        ...l,
                        unitPrice:
                          config.priceList.find((p) => p.type === l.type && p.currency === currency)
                            ?.unitPrice ?? null,
                      })),
                    });
                  }}
                >
                  {Array.from(new Set([plan.currency, 'USD', 'EUR', 'GBP', 'TRY'])).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>,
              )}
            </div>
            {field(
              t.treatment,
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`12 ${t.implant} + 24 ${t.crown}`}
              />,
            )}
            <Button type="button" onClick={parse} disabled={!input.trim()}>
              {t.parse}
            </Button>
            {plan.lines.map((l) => (
              <div key={l.id} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <select
                    aria-label={t.treatment}
                    value={l.type}
                    onChange={(e) => {
                      const type = e.target.value as ConsultationLine['type'];
                      lineChange(l.id, {
                        type,
                        unitPrice:
                          config.priceList.find(
                            (p) => p.type === type && p.currency === plan.currency,
                          )?.unitPrice ?? null,
                      });
                    }}
                    className="min-w-0 flex-1 rounded border bg-background p-2"
                  >
                    {PROCEDURES.map((p) => (
                      <option key={p} value={p}>
                        {t[p]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={t.clear}
                    onClick={() =>
                      change({ ...plan, lines: plan.lines.filter((i) => i.id !== l.id) })
                    }
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {field(
                    t.quantity,
                    <Input
                      type="number"
                      min="1"
                      max="32"
                      value={l.quantity}
                      onChange={(e) => lineChange(l.id, { quantity: Number(e.target.value) })}
                    />,
                  )}
                  {field(
                    t.unitPrice,
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={
                        (!hasPermission(user,'quotes.approve_discount',user?.role===Role.SUPER_ADMIN||user?.role===Role.CLINIC_MANAGER)||!override.includes(l.id)) &&
                        l.unitPrice !== null
                      }
                      value={l.unitPrice ?? ''}
                      onChange={(e) =>
                        lineChange(l.id, {
                          unitPrice: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />,
                  )}
                  {field(
                    t.visit,
                    <select
                      className="h-10 w-full rounded border bg-background px-2"
                      value={l.visit}
                      onChange={(e) => lineChange(l.id, { visit: Number(e.target.value) })}
                    >
                      {plan.visits.map((v) => (
                        <option key={v.number}>{v.number}</option>
                      ))}
                    </select>,
                  )}
                </div>
                {l.unitPrice!==null && (
                  <label className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      disabled={!hasPermission(user,'quotes.approve_discount',user?.role===Role.SUPER_ADMIN||user?.role===Role.CLINIC_MANAGER)}
                      checked={override.includes(l.id)}
                      onChange={(e) =>
                        setOverride((prev) =>
                          e.target.checked ? [...prev, l.id] : prev.filter((i) => i !== l.id),
                        )
                      }
                    />
                    {t.unitPrice} · {t.settings}
                  </label>
                )}
                {override.includes(l.id)&&<Input aria-label="Price exception reason" placeholder="Reason for price exception" value={l.overrideReason??''} onChange={e=>lineChange(l.id,{overrideReason:e.target.value})}/>}
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t.material} · {t.brand} · {t.positions}
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {field(
                      t.material,
                      <Input
                        value={l.material ?? ''}
                        onChange={(e) => lineChange(l.id, { material: e.target.value })}
                      />,
                    )}
                    {field(
                      t.brand,
                      <Input
                        value={l.brand ?? ''}
                        onChange={(e) => lineChange(l.id, { brand: e.target.value })}
                      />,
                    )}
                    {field(
                      t.positions,
                      <Input
                        value={l.positions.join(' ')}
                        onChange={(e) =>
                          lineChange(l.id, {
                            positions: e.target.value.split(/[ ,]+/).filter(Boolean),
                          })
                        }
                      />,
                    )}
                    {field(
                      t.discount,
                      <Input
                        type="number"
                        min="0"
                        value={l.discount}
                        onChange={(e) => lineChange(l.id, { discount: Number(e.target.value) })}
                      />,
                    )}
                  </div>
                  {field(
                    t.treatment,
                    <Textarea
                      value={l.description ?? ''}
                      onChange={(e) => lineChange(l.id, { description: e.target.value })}
                    />,
                  )}
                </details>
              </div>
            ))}
            {plan.visits.map((v) => (
              <div key={v.number} className="space-y-3 rounded-xl border bg-muted/25 p-3">
                <h3 className="font-semibold">
                  {t.visit} {v.number}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {field(
                    t.nights,
                    <Input
                      type="number"
                      min="0"
                      value={v.nights}
                      onChange={(e) =>
                        change({
                          ...plan,
                          visits: plan.visits.map((i) =>
                            i.number === v.number
                              ? { ...i, nights: Number(e.target.value), itinerary: [] }
                              : i,
                          ),
                        })
                      }
                    />,
                  )}
                  {field(
                    t.hotel + ' · ' + t.unitPrice,
                    <Input
                      type="number"
                      min="0"
                      value={v.hotelRate}
                      onChange={(e) =>
                        change({
                          ...plan,
                          visits: plan.visits.map((i) =>
                            i.number === v.number ? { ...i, hotelRate: Number(e.target.value) } : i,
                          ),
                        })
                      }
                    />,
                  )}
                  {field(
                    t.transfer,
                    <select
                      className="h-10 w-full rounded border bg-background px-2"
                      value={v.transfer}
                      onChange={(e) =>
                        change({
                          ...plan,
                          visits: plan.visits.map((i) =>
                            i.number === v.number
                              ? { ...i, transfer: e.target.value as typeof v.transfer }
                              : i,
                          ),
                        })
                      }
                    >
                      {(['included', 'excluded', 'paid'] as const).map((s) => (
                        <option key={s} value={s}>
                          {t[s]}
                        </option>
                      ))}
                    </select>,
                  )}
                </div>
                <label className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={v.hotelIncluded}
                    onChange={(e) =>
                      change({
                        ...plan,
                        visits: plan.visits.map((i) =>
                          i.number === v.number ? { ...i, hotelIncluded: e.target.checked } : i,
                        ),
                      })
                    }
                  />
                  {t.hotel} · {t.included}
                </label>
                {v.transfer === 'paid' &&
                  field(
                    t.transfer + ' · ' + t.unitPrice,
                    <Input
                      type="number"
                      min="0"
                      value={v.transferPrice}
                      onChange={(e) =>
                        change({
                          ...plan,
                          visits: plan.visits.map((i) =>
                            i.number === v.number
                              ? { ...i, transferPrice: Number(e.target.value) }
                              : i,
                          ),
                        })
                      }
                    />,
                  )}
                <details>
                  <summary>{t.journey}</summary>
                  {consultationItinerary(plan, v.number).map((d) => (
                    <div className="my-2 flex items-center gap-2" key={d.day}>
                      <span className="text-xs">
                        {t.day} {d.day}
                      </span>
                      <Input
                        value={d.text ?? t[d.key === 'assessment' ? 'assessmentDay' : d.key!]}
                        onChange={(e) => {
                          const itinerary = consultationItinerary(plan, v.number).map((item) => ({
                            day: item.day,
                            text:
                              item.day === d.day
                                ? e.target.value
                                : (item.text ??
                                  t[item.key === 'assessment' ? 'assessmentDay' : item.key!]),
                          }));
                          change({
                            ...plan,
                            visits: plan.visits.map((i) =>
                              i.number === v.number ? { ...i, itinerary } : i,
                            ),
                          });
                        }}
                      />
                    </div>
                  ))}
                </details>
              </div>
            ))}
            {!!plan.lines.length && (
              <>
                <Label>{t.positions}</Label>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="rounded border bg-background p-2 text-sm"
                    value={lineId}
                    onChange={(e) => {
                      setLineId(e.target.value);
                      setVisit(plan.lines.find((l) => l.id === e.target.value)?.visit ?? 1);
                    }}
                  >
                    {plan.lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {t[l.type]} · {l.quantity} · {t.visit} {l.visit}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => setSelected([...UPPER_TEETH])}>
                    {t.upper}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelected([...LOWER_TEETH])}>
                    {t.lower}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelected([])}>
                    {t.clear}
                  </Button>
                </div>
                <ConsultationChart
                  plan={plan}
                  visit={visit}
                  selected={selected}
                  onSelect={(fdi) =>
                    setSelected((prev) =>
                      prev.includes(fdi) ? prev.filter((i) => i !== fdi) : [...prev, fdi],
                    )
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      const l = plan.lines.find((l) => l.id === lineId);
                      if (l) {
                        if (selected.length > l.quantity) {
                          toast.error(t.quantity);
                          return;
                        }
                        lineChange(l.id, { positions: [...selected] });
                      }
                    }}
                    disabled={!selected.length}
                  >
                    {t.select} → {t.treatment}
                  </Button>
                  {(['healthy', 'missing', 'existingCrown', 'unknown'] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant="outline"
                      disabled={!selected.length}
                      onClick={() =>
                        change({
                          ...plan,
                          findings: {
                            ...plan.findings,
                            ...Object.fromEntries(selected.map((p) => [p, f])),
                          },
                        })
                      }
                    >
                      {t[f]}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[...new Set(plan.lines.map((l) => l.type))].map((type) => (
                    <TreatmentProcess key={type} plan={plan} type={type} />
                  ))}
                </div>
              </>
            )}
            <details>
              <summary>{t.included}</summary>
              <Textarea
                value={plan.includedServices.join('\n')}
                onChange={(e) =>
                  change({ ...plan, includedServices: e.target.value.split('\n').filter(Boolean) })
                }
              />
            </details>
            {consultationWarnings(plan).map((k) => (
              <p
                key={k}
                className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
              >
                {t[k as ConsultationCopyKey]}
              </p>
            ))}
            {!valid.success && plan.lines.length > 0 && (
              <p role="alert" className="text-sm text-destructive">
                {valid.error.issues.map((i) => i.message).join(' · ')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={!undo.length}
                onClick={() => {
                  const prev = undo.at(-1);
                  if (prev) setPlan(prev);
                  setUndo((h) => h.slice(0, -1));
                }}
              >
                {t.undo}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  change({
                    ...plan,
                    findings: {},
                    lines: plan.lines.map((l) => ({ ...l, positions: [] })),
                  });
                  setSelected([]);
                }}
              >
                {t.reset}
              </Button>
              <span className="flex-1 text-lg font-semibold">
                {t.total}:{' '}
                {totals.unpriced ? t.unpriced : `${plan.currency} ${totals.total.toFixed(2)}`}
              </span>
              <Button
                disabled={!valid.success || save.isPending || input !== plan.treatmentText}
                onClick={() => save.mutate()}
              >
                {save.isPending ? '…' : t.save}
              </Button>
            </div>
          </div>
          <div className="space-y-2 lg:sticky lg:top-0 lg:self-start">
            <h3 className="font-semibold">
              {t.preview} {rendering && '…'}
            </h3>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {pdf && valid.success ? (
              <iframe
                title={t.preview}
                src={pdf}
                className={`h-[75vh] w-full rounded-xl border bg-slate-100 ${rendering ? 'opacity-40' : ''}`}
              />
            ) : (
              <p className="rounded-xl border bg-muted p-8 text-sm">{t.treatment}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
