'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { TREATMENT_PRESETS, findPreset, type TreatmentPreset } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { TreatmentCategory } from '@/hooks/use-treatment-plans';
import { EMPTY_ITEM, emptyPhase, type ItemForm, type PhaseForm } from './procedures-editor';

/** Expands a preset into the builder's own form shapes, leaving every price at zero to be filled in. */
export function presetToForms(
  preset: TreatmentPreset,
  categories?: TreatmentCategory[],
): { items: ItemForm[]; phases: PhaseForm[] } {
  const items: ItemForm[] = [];
  const phases: PhaseForm[] = [];

  for (const phase of preset.phases) {
    phases.push({
      ...emptyPhase(phase.phaseNumber),
      name: phase.name ?? '',
      healingPeriodMonths: phase.healingPeriodMonths ?? 0,
    });

    for (const item of phase.items) {
      // Categories are clinic-editable, so a preset names one and takes whatever matches. No match
      // simply leaves it unset — the description still drives the chart via conditionFromText.
      const category = categories?.find((c) => c.name.toLowerCase() === item.categoryName?.toLowerCase());
      items.push({
        ...EMPTY_ITEM,
        description: item.description,
        treatmentCategoryId: category?.id ?? '',
        material: item.material ?? '',
        // One line covers the whole span at one unit price, which is how these are quoted; the
        // chart resolves the list back into individual teeth.
        toothNumber: item.teeth.join(' '),
        quantity: item.teeth.length,
        phaseNumber: phase.phaseNumber,
      });
    }
  }

  return { items, phases };
}

export function QuickPlanPicker({
  categories,
  hasExistingWork,
  onApply,
}: {
  categories?: TreatmentCategory[];
  hasExistingWork: boolean;
  onApply: (forms: { items: ItemForm[]; phases: PhaseForm[] }) => void;
}) {
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState(false);
  const preset = findPreset(selected);

  const apply = () => {
    if (!preset) return;
    onApply(presetToForms(preset, categories));
    setConfirming(false);
  };

  return (
    <div className="rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> Start from a standard plan
          </Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9 w-[260px]">
              <SelectValue placeholder="Choose a protocol…" />
            </SelectTrigger>
            <SelectContent>
              {TREATMENT_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!preset}
          onClick={() => (hasExistingWork ? setConfirming(true) : apply())}
        >
          Apply
        </Button>
      </div>
      {preset && <p className="mt-2 text-xs text-muted-foreground">{preset.summary}</p>}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the procedures you have entered?</AlertDialogTitle>
            <AlertDialogDescription>
              Applying “{preset?.name}” will discard the procedures and phases currently on this plan.
              Your diagnoses and the rest of the form are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
