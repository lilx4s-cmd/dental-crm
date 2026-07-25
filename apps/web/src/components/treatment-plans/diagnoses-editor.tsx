'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { DIAGNOSIS_CONDITIONS, TOOTH_CONDITION_LABELS, type ToothCondition } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DentalChart } from './dental-chart';

export interface DiagnosisEntry {
  condition: ToothCondition;
  toothNumbers: string[];
  notes?: string;
}

/**
 * Charting works the way a dentist dictates findings: pick the condition once, then tap through
 * every tooth showing it. That is far fewer interactions than opening a menu per tooth, and it maps
 * straight onto how the finding is stored and later read back ("Cavities — 11, 16, 25").
 */
export function DiagnosesEditor({
  value,
  onChange,
}: {
  value: DiagnosisEntry[];
  onChange: (next: DiagnosisEntry[]) => void;
}) {
  const [active, setActive] = useState<ToothCondition>('CARIES');

  // The chart shows one condition per tooth. When a tooth carries more than one finding the last
  // one recorded wins, which keeps the picture legible — the full list is right underneath.
  const conditionsByTooth: Record<string, ToothCondition> = {};
  for (const entry of value) {
    for (const tooth of entry.toothNumbers) conditionsByTooth[tooth] = entry.condition;
  }

  const toggleTooth = (tooth: string) => {
    const existing = value.find((e) => e.condition === active);
    if (!existing) {
      onChange([...value, { condition: active, toothNumbers: [tooth] }]);
      return;
    }
    const has = existing.toothNumbers.includes(tooth);
    const toothNumbers = has
      ? existing.toothNumbers.filter((t) => t !== tooth)
      : [...existing.toothNumbers, tooth];
    // Dropping the last tooth removes the finding entirely rather than leaving an empty row.
    const next = toothNumbers.length
      ? value.map((e) => (e.condition === active ? { ...e, toothNumbers } : e))
      : value.filter((e) => e.condition !== active);
    onChange(next);
  };

  const updateEntry = (condition: ToothCondition, patch: Partial<DiagnosisEntry>) =>
    onChange(value.map((e) => (e.condition === condition ? { ...e, ...patch } : e)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>Finding to chart</Label>
          <Select value={active} onValueChange={(v) => setActive(v as ToothCondition)}>
            <SelectTrigger className="h-9 w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIAGNOSIS_CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {TOOTH_CONDITION_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          Click each tooth showing this finding. Click again to remove it.
        </p>
      </div>

      <DentalChart mode="diagnosis" conditionsByTooth={conditionsByTooth} onToothSelect={toggleTooth} />

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings charted yet.</p>
      ) : (
        <div className="rounded-md border">
          <div className="grid grid-cols-12 gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium">
            <span className="col-span-4">Diagnosis</span>
            <span className="col-span-4">Teeth</span>
            <span className="col-span-3">Notes</span>
            <span className="col-span-1" />
          </div>
          {value.map((entry) => (
            <div key={entry.condition} className="grid grid-cols-12 items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
              <span className="col-span-4">{TOOTH_CONDITION_LABELS[entry.condition]}</span>
              <span className="col-span-4 tabular-nums text-muted-foreground">
                {[...entry.toothNumbers].sort().join(' · ')}
              </span>
              <Input
                className="col-span-3 h-8 text-xs"
                placeholder="Optional"
                value={entry.notes ?? ''}
                onChange={(e) => updateEntry(entry.condition, { notes: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="col-span-1 h-8 px-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(value.filter((e) => e.condition !== entry.condition))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
