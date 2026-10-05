'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  computePlanTotal,
  computePhaseTotals,
  PACKAGE_INCLUSIONS,
  conditionFromText,
  parseToothNumbers,
  type ToothCondition,
} from '@dental-crm/shared';

import { useCreateTreatmentPlan, useTreatmentCategories, type TreatmentPlan } from '@/hooks/use-treatment-plans';
import { useClinicSettings } from '@/hooks/use-reports';
import { useDentists, useCoordinators } from '@/hooks/use-users';
import { num } from '@/lib/numeric-input';
import { DentalChart } from './dental-chart';
import { DiagnosesEditor, type DiagnosisEntry } from './diagnoses-editor';
import { formatMoney } from '@/lib/money';
import { QuickPlanPicker } from './quick-plan-picker';
import {
  EMPTY_STAY,
  StayScheduleEditor,
  schedulePayload,
  stayPayload,
  type ScheduleItemForm,
  type StayForm,
} from './stay-schedule-editor';
import {
  EMPTY_ITEM,
  ProceduresEditor,
  emptyPhase,
  lineCost,
  phasePayload,
  type ItemForm,
  type PhaseForm,
} from './procedures-editor';

export function NewTreatmentPlanDialog({
  patientId,
  open,
  onClose,
  initialPlan,
}: {
  patientId: string;
  open: boolean;
  onClose: () => void;
  initialPlan?: TreatmentPlan;
}) {
  const create = useCreateTreatmentPlan();
  const { data: categories } = useTreatmentCategories();
  const { data: dentists } = useDentists();
  const { data: coordinators } = useCoordinators();
  const { data: settings } = useClinicSettings();

  const [title, setTitle] = useState(initialPlan ? initialPlan.title + ' - revised proposal' : '');
  const [notes, setNotes] = useState(initialPlan?.notes ?? '');
  const [currencyChoice, setCurrency] = useState(initialPlan?.currency ?? '');
  const currency = currencyChoice || settings?.currency || 'EUR';
  const [assignedDentistId, setAssignedDentistId] = useState(initialPlan?.assignedDentistId ?? '');
  const [assignedCoordinatorId, setAssignedCoordinatorId] = useState(initialPlan?.assignedCoordinatorId ?? '');
  const [doctorRecommendation, setDoctorRecommendation] = useState(initialPlan?.doctorRecommendation ?? '');
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>(initialPlan?.diagnoses.map(d => ({ condition: d.condition, toothNumbers: [...d.toothNumbers], notes: d.notes ?? '' })) ?? []);
  const [items, setItems] = useState<ItemForm[]>(initialPlan?.items.map(item => ({
    ...EMPTY_ITEM,
    description: item.description,
    treatmentCategoryId: item.treatmentCategory?.id ?? '',
    toothNumber: item.toothNumber ?? '',
    material: item.material ?? '',
    brand: item.brand ?? '',
    quantity: String(item.quantity),
    unitPrice: item.unitPrice != null ? String(item.unitPrice) : Number(item.cost) > 0 ? String((Number(item.cost) + Number(item.discount)) / item.quantity) : '',
    discount: String(item.discount ?? 0),
    clinicalNotes: item.clinicalNotes ?? '',
    phaseNumber: item.phaseNumber,
  })) ?? [{ ...EMPTY_ITEM }]);
  const [phases, setPhases] = useState<PhaseForm[]>(initialPlan?.phases.map(phase => ({
    ...emptyPhase(phase.phaseNumber), name: phase.name ?? '',
    discountAmount: String(phase.discountAmount ?? ''),
    discountPercent: phase.discountPercent != null ? String(phase.discountPercent) : '',
    healingPeriodMonths: phase.healingPeriodMonths != null ? String(phase.healingPeriodMonths) : '',
  })) ?? [emptyPhase(1)]);
  const [includes, setIncludes] = useState<string[] | null>(initialPlan?.packageIncludes ?? null);
  const selectedIncludes = includes ?? settings?.defaultPackageIncludes ?? [];
  const hasUnpriced = items.some(item => item.description.trim() && item.unitPrice === '');
  const [deposit, setDeposit] = useState(initialPlan?.depositAmount != null ? String(initialPlan.depositAmount) : '');
  const [cardFee, setCardFee] = useState(initialPlan?.cardFeePercent != null ? String(initialPlan.cardFeePercent) : '');
  const [cashDiscount, setCashDiscount] = useState(initialPlan?.cashDiscountPercent != null ? String(initialPlan.cashDiscountPercent) : '');
  const [paymentTerms, setPaymentTerms] = useState<string | null>(initialPlan?.paymentTerms ?? null);
  const [flightNote, setFlightNote] = useState(initialPlan?.flightRefundNote ?? '');
  const [stay, setStay] = useState<StayForm>({ ...EMPTY_STAY });
  const [schedule, setSchedule] = useState<ScheduleItemForm[]>([]);

  const total = useMemo(
    () =>
      computePlanTotal(
        items.map((i) => ({ cost: lineCost(i), phaseNumber: i.phaseNumber })),
        phases.map((p) => ({
          phaseNumber: p.phaseNumber,
          discountAmount: num(p.discountAmount),
          discountPercent: num(p.discountPercent),
        })),
      ),
    [items, phases],
  );

  // Map tooth -> planned procedure(s) so the chart can highlight + tooltip them, and derive the
  // condition to draw from the category or free-text description. Deriving it means the chart
  // updates as the procedure is typed, without asking staff to pick a condition separately.
  const { itemsByTooth, plannedByTooth } = useMemo(() => {
    const byTooth: Record<string, { description: string; category?: string }[]> = {};
    const conditions: Record<string, ToothCondition> = {};
    for (const it of items) {
      const teeth = parseToothNumbers(it.toothNumber);
      if (teeth.length === 0) continue;
      const category = categories?.find((c) => c.id === it.treatmentCategoryId)?.name;
      const condition = conditionFromText(category, it.description);
      for (const tooth of teeth) {
        (byTooth[tooth] ??= []).push({ description: it.description || 'Untitled procedure', category });
        if (condition) conditions[tooth] = condition;
      }
    }
    return { itemsByTooth: byTooth, plannedByTooth: conditions };
  }, [items, categories]);

  // Teeth already charted as missing stay missing on the proposed chart unless the plan puts
  // something back — otherwise the "after" picture would grow teeth the patient does not have.
  const planChartConditions = useMemo(() => {
    const missing: Record<string, ToothCondition> = {};
    for (const d of diagnoses) {
      if (d.condition === 'MISSING') for (const t of d.toothNumbers) missing[t] = 'MISSING';
    }
    return { ...missing, ...plannedByTooth };
  }, [diagnoses, plannedByTooth]);

  // Clicking a tooth on the chart: fill the first blank-tooth row if one exists, otherwise
  // append a fresh row pre-filled with that tooth — so a click always lands somewhere sensible.
  const handleToothSelect = (tooth: string) => {
    setItems((prev) => {
      const blankIdx = prev.findIndex((i) => !i.toothNumber);
      if (blankIdx >= 0) {
        return prev.map((it, i) => (i === blankIdx ? { ...it, toothNumber: tooth } : it));
      }
      return [...prev, { ...EMPTY_ITEM, toothNumber: tooth, phaseNumber: prev[prev.length - 1]?.phaseNumber ?? 1 }];
    });
  };

  const reset = () => {
    setTitle('');
    setNotes('');
    setAssignedDentistId('');
    setAssignedCoordinatorId('');
    setDoctorRecommendation('');
    setDiagnoses([]);
    setItems([{ ...EMPTY_ITEM }]);
    setPhases([emptyPhase(1)]);
    setStay({ ...EMPTY_STAY });
    setSchedule([]);
    setCurrency('');
    setIncludes(null);
    setDeposit('');
    setCardFee('');
    setCashDiscount('');
    setPaymentTerms(null);
    setFlightNote('');
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    const procedures = items.filter(item => item.description.trim());
    if (procedures.length === 0) {
      toast.error('Add at least one treatment procedure.');
      return;
    }
    if (procedures.some(item => !Number.isInteger(num(item.quantity, 1)) || num(item.quantity, 1) < 1 ||
      num(item.unitPrice) < 0 || num(item.discount) < 0 || num(item.discount) > num(item.unitPrice) * num(item.quantity, 1))) {
      toast.error('Check quantities, prices and discounts. Quantities must be whole numbers and discounts cannot exceed the line price.');
      return;
    }
    if (phases.some(phase => num(phase.discountPercent) < 0 || num(phase.discountPercent) > 100 ||
      num(phase.discountAmount) < 0 || num(phase.healingPeriodMonths) < 0 || !Number.isInteger(num(phase.healingPeriodMonths)))) {
      toast.error('Check visit discounts and healing periods.');
      return;
    }
    if ([cardFee, cashDiscount].some(value => num(value) < 0 || num(value) > 100) || num(deposit) < 0 || num(deposit) > total) {
      toast.error('Check the deposit and payment percentages.');
      return;
    }
    const payloadItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({
        description: i.description.trim(),
        // Quantity mirrors lineCost's fallback: a blank box means one unit, not zero.
        quantity: num(i.quantity, 1),
        cost: lineCost(i),
        unitPrice: i.unitPrice === '' ? undefined : num(i.unitPrice),
        discount: num(i.discount),
        toothNumber: i.toothNumber || undefined,
        treatmentCategoryId: i.treatmentCategoryId || undefined,
        material: i.material || undefined,
        brand: i.brand || undefined,
        clinicalNotes: i.clinicalNotes || undefined,
        phaseNumber: i.phaseNumber,
        toothCondition: parseToothNumbers(i.toothNumber).map((t) => plannedByTooth[t]).find(Boolean),
      }));

    // A phase row is only worth storing when it carries something the items cannot imply.
    const carriedPhases = phases.filter(
      (p) => p.name || num(p.discountAmount) || num(p.discountPercent) || num(p.healingPeriodMonths),
    );

    create.mutate(
      {
        patientId,
        title: title.trim(),
        currency,
        notes: notes || undefined,
        assignedDentistId: assignedDentistId || undefined,
        assignedCoordinatorId: assignedCoordinatorId || undefined,
        doctorRecommendation: doctorRecommendation || undefined,
        packageIncludes: selectedIncludes,
        depositAmount: deposit === '' ? undefined : num(deposit),
        cardFeePercent: cardFee === '' ? undefined : num(cardFee),
        cashDiscountPercent: cashDiscount === '' ? undefined : num(cashDiscount),
        paymentTerms: paymentTerms ?? settings?.defaultPaymentTerms ?? undefined,
        flightRefundNote: flightNote || undefined,
        language: initialPlan?.language,
        items: payloadItems,
        diagnoses: diagnoses.length
          ? diagnoses.map((d) => ({ condition: d.condition, toothNumbers: d.toothNumbers, notes: d.notes || undefined }))
          : undefined,
        // Only phases that actually carry something are worth persisting; the rest are implied
        // by the items' phaseNumber.
        phases: carriedPhases.length ? carriedPhases.map(phasePayload) : undefined,
        stay: stayPayload(stay),
        scheduleItems: schedulePayload(schedule),
      },
      {
        onSuccess: () => {
          toast.success('Treatment plan created');
          reset();
          onClose();
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create plan'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !create.isPending) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{initialPlan ? 'Revise Treatment Plan' : 'New Treatment Plan'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {initialPlan && <p className="text-sm text-muted-foreground">Create a new proposal with revised treatments and prices. Your original plan stays available. Confirm the travel dates for this proposal separately.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="plan-title">Plan Title *</Label>
              <Input
                id="plan-title"
                placeholder="e.g. Full-mouth rehabilitation"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note (optional)" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="plan-currency">Quote currency</Label>
            <select id="plan-currency" className="h-10 rounded-md border bg-background px-3 text-sm" value={currency} onChange={e => setCurrency(e.target.value)}>
              {Array.from(new Set([currency, 'EUR', 'USD', 'GBP', 'TRY'])).map(value => <option value={value} key={value}>{value}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Assigned Dentist</Label>
              <Select value={assignedDentistId} onValueChange={setAssignedDentistId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {dentists?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      Dr. {d.firstName} {d.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Treatment Coordinator</Label>
              <Select value={assignedCoordinatorId} onValueChange={setAssignedCoordinatorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {coordinators?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Doctor&apos;s Recommendation</Label>
            <Textarea
              rows={2}
              value={doctorRecommendation}
              onChange={(e) => setDoctorRecommendation(e.target.value)}
              placeholder="Clinical recommendation shown to the patient"
            />
          </div>

          {/* Split the way the patient document reads: what is wrong now, then what to do about it. */}
          <Tabs defaultValue="plan">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="diagnosis">
                Diagnosis{diagnoses.length > 0 && ` (${diagnoses.length})`}
              </TabsTrigger>
              <TabsTrigger value="plan">Treatment Plan</TabsTrigger>
              <TabsTrigger value="stay">
                Stay &amp; Schedule{schedule.length > 0 && ` (${schedule.length})`}
              </TabsTrigger>
              <TabsTrigger value="package">Package &amp; Payment</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>

            <TabsContent value="diagnosis" className="pt-3">
              <DiagnosesEditor value={diagnoses} onChange={setDiagnoses} />
            </TabsContent>

            <TabsContent value="plan" className="space-y-3 pt-3">
              <QuickPlanPicker
                categories={categories}
                hasExistingWork={items.some((i) => i.description.trim())}
                onApply={({ items: nextItems, phases: nextPhases, title: nextTitle }) => {
                  setItems(nextItems);
                  setPhases(nextPhases);
                  if (!title.trim() && nextTitle) setTitle(nextTitle);
                  toast.success('Plan template applied — set your prices to finish.');
                }}
              />

              <Label>Proposed result — click a tooth to add it to a procedure</Label>
              <DentalChart
                mode="plan"
                itemsByTooth={itemsByTooth}
                conditionsByTooth={planChartConditions}
                onToothSelect={handleToothSelect}
              />
              <ProceduresEditor
                items={items}
                phases={phases}
                categories={categories}
                currency={currency}
                onItemsChange={setItems}
                onPhasesChange={setPhases}
              />
            </TabsContent>
            <TabsContent value="stay" className="pt-3">
              <StayScheduleEditor
                stay={stay}
                schedule={schedule}
                onStayChange={setStay}
                onScheduleChange={setSchedule}
              />
            </TabsContent>
            <TabsContent value="package" className="space-y-4 pt-3">
              <p className="text-sm text-muted-foreground">Choose exactly what this quote includes. Payment fields left empty use the clinic defaults.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PACKAGE_INCLUSIONS.map(option => (
                  <label key={option.key} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={selectedIncludes.includes(option.key)}
                      onChange={e => setIncludes(e.target.checked ? [...selectedIncludes, option.key] : selectedIncludes.filter(key => key !== option.key))} />
                    {option.label}
                  </label>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label htmlFor="plan-deposit">Deposit ({currency})</Label><Input id="plan-deposit" type="number" min="0" step="0.01" value={deposit} onChange={e => setDeposit(e.target.value)} /></div>
                <div><Label htmlFor="plan-card-fee">Card fee %</Label><Input id="plan-card-fee" type="number" min="0" max="100" placeholder={String(settings?.defaultCardFeePercent ?? '')} value={cardFee} onChange={e => setCardFee(e.target.value)} /></div>
                <div><Label htmlFor="plan-cash-discount">Cash discount %</Label><Input id="plan-cash-discount" type="number" min="0" max="100" placeholder={String(settings?.defaultCashDiscountPercent ?? '')} value={cashDiscount} onChange={e => setCashDiscount(e.target.value)} /></div>
              </div>
              <div><Label htmlFor="plan-payment-terms">Payment terms and visit duration</Label><Textarea id="plan-payment-terms" rows={3} value={paymentTerms ?? settings?.defaultPaymentTerms ?? ''} onChange={e => setPaymentTerms(e.target.value)} placeholder="Visit 1 is paid separately. Visit 2 requires approximately 7 days after healing is confirmed. Hotel and transfers are included for the first visit." /></div>
              <div><Label htmlFor="plan-flight-note">Flight arrangement (optional)</Label><Input id="plan-flight-note" value={flightNote} onChange={e => setFlightNote(e.target.value)} /></div>
            </TabsContent>
            <TabsContent value="review" className="space-y-3 pt-3">
              <h3 className="text-lg font-semibold">{title || 'Untitled treatment plan'}</h3>
              {doctorRecommendation && <p className="whitespace-pre-wrap text-sm">{doctorRecommendation}</p>}
              {computePhaseTotals(items.filter(item => item.description.trim()).map(item => ({ cost: lineCost(item), phaseNumber: item.phaseNumber })),
                phases.map(phase => ({ phaseNumber: phase.phaseNumber, name: phase.name, discountPercent: num(phase.discountPercent), discountAmount: num(phase.discountAmount), healingPeriodMonths: num(phase.healingPeriodMonths) }))).map((phase, index) => (
                <div key={phase.phaseNumber} className="rounded-md border p-3 text-sm">
                  <p className="font-semibold">Visit {index + 1}{phase.name && ' - ' + phase.name} · {items.some(item => item.phaseNumber === phase.phaseNumber && item.description.trim() && item.unitPrice === '') ? 'Provisional subtotal: ' : ''}{formatMoney(phase.total, currency)}</p>
                  {items.filter(item => item.phaseNumber === phase.phaseNumber && item.description.trim()).map((item, row) => (
                    <p className="mt-1" key={row}>{num(item.quantity, 1)} × {item.description} · {[item.material, item.brand].filter(Boolean).join(' / ')} · {item.unitPrice === '' ? 'Price to be confirmed' : formatMoney(lineCost(item), currency)}</p>
                  ))}
                  {phase.healingPeriodMonths ? <p className="mt-2 text-muted-foreground">Healing before the next visit: approximately {phase.healingPeriodMonths} months, subject to the dentist&apos;s confirmation.</p> : null}
                </div>
              ))}
              <p className="text-sm">Included: {selectedIncludes.map(key => PACKAGE_INCLUSIONS.find(option => option.key === key)?.label).filter(Boolean).join(', ') || 'Only listed dental procedures'}</p>
              {(paymentTerms ?? settings?.defaultPaymentTerms) && <p className="whitespace-pre-wrap text-sm">{paymentTerms ?? settings?.defaultPaymentTerms}</p>}
              <p className="text-sm text-muted-foreground">Confirm the materials, treatment scope and prices before sharing the patient PDF.</p>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="sticky bottom-[-1.5rem] -mx-6 -mb-6 items-center justify-between border-t bg-background px-6 py-4 sm:justify-between">
          <span className="text-sm">
            {hasUnpriced ? 'Provisional subtotal: ' : 'Total: '}<strong className="tabular-nums">{formatMoney(total, currency)}</strong>
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : initialPlan ? 'Create revised plan' : 'Create Plan'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
