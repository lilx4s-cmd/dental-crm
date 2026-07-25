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

import { computePlanTotal, conditionFromText, type ToothCondition } from '@dental-crm/shared';

import { useCreateTreatmentPlan, useTreatmentCategories } from '@/hooks/use-treatment-plans';
import { useDentists, useCoordinators } from '@/hooks/use-users';
import { DentalChart } from './dental-chart';
import { DiagnosesEditor, type DiagnosisEntry } from './diagnoses-editor';
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
}: {
  patientId: string;
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateTreatmentPlan();
  const { data: categories } = useTreatmentCategories();
  const { data: dentists } = useDentists();
  const { data: coordinators } = useCoordinators();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [currency] = useState('EUR');
  const [assignedDentistId, setAssignedDentistId] = useState('');
  const [assignedCoordinatorId, setAssignedCoordinatorId] = useState('');
  const [doctorRecommendation, setDoctorRecommendation] = useState('');
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>([]);
  const [items, setItems] = useState<ItemForm[]>([{ ...EMPTY_ITEM }]);
  const [phases, setPhases] = useState<PhaseForm[]>([emptyPhase(1)]);

  const total = useMemo(
    () =>
      computePlanTotal(
        items.map((i) => ({ cost: lineCost(i), phaseNumber: i.phaseNumber })),
        phases,
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
      if (!it.toothNumber) continue;
      const category = categories?.find((c) => c.id === it.treatmentCategoryId)?.name;
      (byTooth[it.toothNumber] ??= []).push({ description: it.description || 'Untitled procedure', category });
      const condition = conditionFromText(category, it.description);
      if (condition) conditions[it.toothNumber] = condition;
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
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    const payloadItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        cost: lineCost(i),
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount),
        toothNumber: i.toothNumber || undefined,
        treatmentCategoryId: i.treatmentCategoryId || undefined,
        material: i.material || undefined,
        brand: i.brand || undefined,
        clinicalNotes: i.clinicalNotes || undefined,
        phaseNumber: i.phaseNumber,
        toothCondition: i.toothNumber ? plannedByTooth[i.toothNumber] : undefined,
      }));

    create.mutate(
      {
        patientId,
        title,
        currency,
        notes: notes || undefined,
        assignedDentistId: assignedDentistId || undefined,
        assignedCoordinatorId: assignedCoordinatorId || undefined,
        doctorRecommendation: doctorRecommendation || undefined,
        items: payloadItems,
        diagnoses: diagnoses.length
          ? diagnoses.map((d) => ({ condition: d.condition, toothNumbers: d.toothNumbers, notes: d.notes || undefined }))
          : undefined,
        // Only phases that actually carry something are worth persisting; the rest are implied
        // by the items' phaseNumber.
        phases: phases.filter((p) => p.name || p.discountAmount || p.discountPercent || p.healingPeriodMonths).length
          ? phases
              .filter((p) => p.name || p.discountAmount || p.discountPercent || p.healingPeriodMonths)
              .map(phasePayload)
          : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Treatment plan created');
          reset();
          onClose();
        },
        onError: () => toast.error('Failed to create plan'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Treatment Plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Plan Title *</Label>
              <Input
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

          <div className="grid grid-cols-2 gap-3">
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
          <Tabs defaultValue="diagnosis">
            <TabsList>
              <TabsTrigger value="diagnosis">
                Diagnosis{diagnoses.length > 0 && ` (${diagnoses.length})`}
              </TabsTrigger>
              <TabsTrigger value="plan">Treatment Plan</TabsTrigger>
            </TabsList>

            <TabsContent value="diagnosis" className="pt-3">
              <DiagnosesEditor value={diagnoses} onChange={setDiagnoses} />
            </TabsContent>

            <TabsContent value="plan" className="space-y-3 pt-3">
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
          </Tabs>
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <span className="text-sm">
            Total: <strong className="tabular-nums">{total.toLocaleString()}</strong> {currency}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create Plan'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
