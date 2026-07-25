'use client';

import { Plus, Trash2 } from 'lucide-react';
import { computePhaseTotals, type PhaseTotal } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TreatmentCategory } from '@/hooks/use-treatment-plans';

// Numeric fields are held as text, not numbers. A controlled number input backed by `number` can
// never be emptied — clearing it parses to NaN, falls back to 0, and the field immediately refills
// with "0", so typing a price appends after that zero instead of replacing it.
export interface ItemForm {
  treatmentCategoryId: string;
  toothNumber: string;
  description: string;
  material: string;
  brand: string;
  unitPrice: string;
  quantity: string;
  discount: string;
  clinicalNotes: string;
  phaseNumber: number;
}

export interface PhaseForm {
  phaseNumber: number;
  name: string;
  discountAmount: string;
  discountPercent: string;
  healingPeriodMonths: string;
}

/** Reads a numeric form field, treating blank or half-typed input as zero. */
export function num(value: string, fallback = 0): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const EMPTY_ITEM: ItemForm = {
  treatmentCategoryId: '',
  toothNumber: '',
  description: '',
  material: '',
  brand: '',
  unitPrice: '',
  quantity: '1',
  discount: '',
  clinicalNotes: '',
  phaseNumber: 1,
};

export function emptyPhase(phaseNumber: number): PhaseForm {
  return { phaseNumber, name: '', discountAmount: '', discountPercent: '', healingPeriodMonths: '' };
}

// The authoritative line total the backend stores and sums. Kept identical to the backend's
// expectation: unitPrice * quantity - discount, floored at 0.
export function lineCost(i: ItemForm) {
  // Quantity defaults to 1 so a blank box prices one unit rather than wiping the line to zero.
  return Math.max(0, num(i.unitPrice) * num(i.quantity, 1) - num(i.discount));
}

/** Strips the zero placeholders the number inputs carry so unset fields are omitted, not sent as 0. */
export function phasePayload(p: PhaseForm) {
  return {
    phaseNumber: p.phaseNumber,
    name: p.name || undefined,
    discountAmount: num(p.discountAmount) || undefined,
    discountPercent: num(p.discountPercent) || undefined,
    healingPeriodMonths: num(p.healingPeriodMonths) || undefined,
  };
}

export function ProceduresEditor({
  items,
  phases,
  categories,
  currency,
  onItemsChange,
  onPhasesChange,
}: {
  items: ItemForm[];
  phases: PhaseForm[];
  categories?: TreatmentCategory[];
  currency: string;
  onItemsChange: (next: ItemForm[]) => void;
  onPhasesChange: (next: PhaseForm[]) => void;
}) {
  const totals = computePhaseTotals(
    items.map((i) => ({ cost: lineCost(i), phaseNumber: i.phaseNumber })),
    phases.map((p) => ({
      phaseNumber: p.phaseNumber,
      discountAmount: num(p.discountAmount),
      discountPercent: num(p.discountPercent),
      healingPeriodMonths: num(p.healingPeriodMonths),
    })),
  );
  const grandTotal = totals.reduce((s, t) => s + t.total, 0);
  const phaseNumbers = totals.map((t) => t.phaseNumber);

  const updateItem = (idx: number, patch: Partial<ItemForm>) =>
    onItemsChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const updatePhase = (phaseNumber: number, patch: Partial<PhaseForm>) => {
    const existing = phases.find((p) => p.phaseNumber === phaseNumber);
    onPhasesChange(
      existing
        ? phases.map((p) => (p.phaseNumber === phaseNumber ? { ...p, ...patch } : p))
        : [...phases, { ...emptyPhase(phaseNumber), ...patch }],
    );
  };

  const addPhase = () => {
    const next = Math.max(0, ...phaseNumbers) + 1;
    onItemsChange([...items, { ...EMPTY_ITEM, phaseNumber: next }]);
    onPhasesChange([...phases, emptyPhase(next)]);
  };

  return (
    <div className="space-y-4">
      {totals.map((phase) => (
        <PhaseBlock
          key={phase.phaseNumber}
          phase={phase}
          config={phases.find((p) => p.phaseNumber === phase.phaseNumber) ?? emptyPhase(phase.phaseNumber)}
          items={items}
          categories={categories}
          currency={currency}
          canRemove={totals.length > 1}
          onUpdateItem={updateItem}
          onUpdatePhase={updatePhase}
          onAddItem={() => onItemsChange([...items, { ...EMPTY_ITEM, phaseNumber: phase.phaseNumber }])}
          onRemoveItem={(idx) => items.length > 1 && onItemsChange(items.filter((_, i) => i !== idx))}
          onRemovePhase={() => {
            onItemsChange(items.filter((i) => i.phaseNumber !== phase.phaseNumber));
            onPhasesChange(phases.filter((p) => p.phaseNumber !== phase.phaseNumber));
          }}
        />
      ))}

      <div className="flex items-center justify-between border-t pt-3">
        <Button type="button" variant="outline" size="sm" onClick={addPhase}>
          <Plus className="mr-1 h-3 w-3" /> Add Phase
        </Button>
        <span className="text-sm">
          Total: <strong className="tabular-nums">{grandTotal.toLocaleString()}</strong> {currency}
        </span>
      </div>
    </div>
  );
}

function PhaseBlock({
  phase,
  config,
  items,
  categories,
  currency,
  canRemove,
  onUpdateItem,
  onUpdatePhase,
  onAddItem,
  onRemoveItem,
  onRemovePhase,
}: {
  phase: PhaseTotal;
  config: PhaseForm;
  items: ItemForm[];
  categories?: TreatmentCategory[];
  currency: string;
  canRemove: boolean;
  onUpdateItem: (idx: number, patch: Partial<ItemForm>) => void;
  onUpdatePhase: (phaseNumber: number, patch: Partial<PhaseForm>) => void;
  onAddItem: () => void;
  onRemoveItem: (idx: number) => void;
  onRemovePhase: () => void;
}) {
  // Item rows are addressed by their index in the flat list, since that is what the parent mutates.
  const rows = items.map((item, idx) => ({ item, idx })).filter(({ item }) => item.phaseNumber === phase.phaseNumber);

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Phase {phase.phaseNumber}</span>
          <Input
            className="h-7 w-44 text-xs"
            placeholder="Name (optional)"
            value={config.name}
            onChange={(e) => onUpdatePhase(phase.phaseNumber, { name: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums">
            {phase.discount > 0 && (
              <span className="mr-2 text-muted-foreground line-through">{phase.subtotal.toLocaleString()}</span>
            )}
            <strong>{phase.total.toLocaleString()}</strong> {currency}
          </span>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-1 text-muted-foreground hover:text-destructive"
              onClick={onRemovePhase}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {rows.map(({ item, idx }) => (
          <div key={idx} className="space-y-2 rounded-md border p-2">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-4">
                <Select
                  value={item.treatmentCategoryId}
                  onValueChange={(v) => onUpdateItem(idx, { treatmentCategoryId: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                className="col-span-2 h-8 text-xs"
                placeholder="Tooth #"
                value={item.toothNumber}
                onChange={(e) => onUpdateItem(idx, { toothNumber: e.target.value })}
              />
              <Input
                className="col-span-5 h-8 text-xs"
                placeholder="Description"
                value={item.description}
                onChange={(e) => onUpdateItem(idx, { description: e.target.value })}
              />
              <button
                type="button"
                className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-destructive"
                onClick={() => onRemoveItem(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <Input
                className="col-span-3 h-8 text-xs"
                placeholder="Material"
                value={item.material}
                onChange={(e) => onUpdateItem(idx, { material: e.target.value })}
              />
              <Input
                className="col-span-3 h-8 text-xs"
                placeholder="Brand"
                value={item.brand}
                onChange={(e) => onUpdateItem(idx, { brand: e.target.value })}
              />
              <Input
                className="col-span-2 h-8 text-xs"
                type="number"
                step="0.01"
                placeholder="Unit price"
                value={item.unitPrice}
                onChange={(e) => onUpdateItem(idx, { unitPrice: e.target.value })}
              />
              <Input
                className="col-span-1 h-8 text-xs"
                type="number"
                min="1"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => onUpdateItem(idx, { quantity: e.target.value })}
              />
              <Input
                className="col-span-2 h-8 text-xs"
                type="number"
                step="0.01"
                placeholder="Discount"
                value={item.discount}
                onChange={(e) => onUpdateItem(idx, { discount: e.target.value })}
              />
              <div className="col-span-1 flex items-center justify-end text-xs font-medium tabular-nums">
                {lineCost(item).toLocaleString()}
              </div>
            </div>
            <Input
              className="h-8 text-xs"
              placeholder="Clinical notes (optional)"
              value={item.clinicalNotes}
              onChange={(e) => onUpdateItem(idx, { clinicalNotes: e.target.value })}
            />
          </div>
        ))}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onAddItem}>
            <Plus className="mr-1 h-3 w-3" /> Add Procedure
          </Button>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Discount %</Label>
              <Input
                className="h-8 w-20 text-xs"
                type="number"
                min="0"
                max="100"
                value={config.discountPercent}
                onChange={(e) => onUpdatePhase(phase.phaseNumber, { discountPercent: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Discount {currency}</Label>
              <Input
                className="h-8 w-24 text-xs"
                type="number"
                min="0"
                step="0.01"
                value={config.discountAmount}
                onChange={(e) => onUpdatePhase(phase.phaseNumber, { discountAmount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Healing (months)</Label>
              <Input
                className="h-8 w-24 text-xs"
                type="number"
                min="0"
                value={config.healingPeriodMonths}
                onChange={(e) => onUpdatePhase(phase.phaseNumber, { healingPeriodMonths: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
