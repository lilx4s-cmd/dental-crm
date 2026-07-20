'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useCreateTreatmentPlan, useTreatmentCategories } from '@/hooks/use-treatment-plans';
import { useDentists, useCoordinators } from '@/hooks/use-users';
import { DentalChart } from './dental-chart';

interface ItemForm {
  treatmentCategoryId: string;
  toothNumber: string;
  description: string;
  material: string;
  brand: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  clinicalNotes: string;
}

const EMPTY_ITEM: ItemForm = {
  treatmentCategoryId: '',
  toothNumber: '',
  description: '',
  material: '',
  brand: '',
  unitPrice: 0,
  quantity: 1,
  discount: 0,
  clinicalNotes: '',
};

// cost is the authoritative line total the backend stores and sums into the plan total.
// Keep this identical to the backend's expectation: unitPrice * quantity - discount, floored at 0.
function lineCost(i: ItemForm) {
  return Math.max(0, i.unitPrice * i.quantity - i.discount);
}

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
  const [assignedDentistId, setAssignedDentistId] = useState('');
  const [assignedCoordinatorId, setAssignedCoordinatorId] = useState('');
  const [doctorRecommendation, setDoctorRecommendation] = useState('');
  const [items, setItems] = useState<ItemForm[]>([{ ...EMPTY_ITEM }]);

  const updateItem = (idx: number, patch: Partial<ItemForm>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const total = useMemo(() => items.reduce((s, i) => s + lineCost(i), 0), [items]);

  // Map tooth -> planned procedure descriptions so the chart can highlight + tooltip them.
  const itemsByTooth = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const it of items) {
      if (!it.toothNumber) continue;
      (map[it.toothNumber] ??= []).push(it.description || 'Untitled procedure');
    }
    return map;
  }, [items]);

  // Clicking a tooth on the chart: fill the first blank-tooth row if one exists, otherwise
  // append a fresh row pre-filled with that tooth — so a click always lands somewhere sensible.
  const handleToothSelect = (tooth: string) => {
    setItems((prev) => {
      const blankIdx = prev.findIndex((i) => !i.toothNumber);
      if (blankIdx >= 0) {
        return prev.map((it, i) => (i === blankIdx ? { ...it, toothNumber: tooth } : it));
      }
      return [...prev, { ...EMPTY_ITEM, toothNumber: tooth }];
    });
  };

  const reset = () => {
    setTitle('');
    setNotes('');
    setAssignedDentistId('');
    setAssignedCoordinatorId('');
    setDoctorRecommendation('');
    setItems([{ ...EMPTY_ITEM }]);
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
      }));

    create.mutate(
      {
        patientId,
        title,
        notes: notes || undefined,
        assignedDentistId: assignedDentistId || undefined,
        assignedCoordinatorId: assignedCoordinatorId || undefined,
        doctorRecommendation: doctorRecommendation || undefined,
        items: payloadItems,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Treatment Plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Plan Title *</Label>
              <Input placeholder="e.g. Full-mouth rehabilitation" value={title} onChange={(e) => setTitle(e.target.value)} />
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
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {dentists?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Treatment Coordinator</Label>
              <Select value={assignedCoordinatorId} onValueChange={setAssignedCoordinatorId}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {coordinators?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Doctor's Recommendation</Label>
            <Textarea rows={2} value={doctorRecommendation} onChange={(e) => setDoctorRecommendation(e.target.value)} placeholder="Clinical recommendation shown to the patient" />
          </div>

          <div className="space-y-2">
            <Label>Tooth chart — click a tooth to add it to a procedure</Label>
            <div className="flex justify-center">
              <DentalChart itemsByTooth={itemsByTooth} onToothSelect={handleToothSelect} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Procedures</Label>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <Select value={item.treatmentCategoryId} onValueChange={(v) => updateItem(i, { treatmentCategoryId: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="col-span-2 h-8 text-xs" placeholder="Tooth #" value={item.toothNumber} onChange={(e) => updateItem(i, { toothNumber: e.target.value })} />
                    <Input className="col-span-5 h-8 text-xs" placeholder="Description" value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
                    <button
                      type="button"
                      className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-destructive"
                      onClick={() => items.length > 1 && setItems((p) => p.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <Input className="col-span-3 h-8 text-xs" placeholder="Material" value={item.material} onChange={(e) => updateItem(i, { material: e.target.value })} />
                    <Input className="col-span-3 h-8 text-xs" placeholder="Brand" value={item.brand} onChange={(e) => updateItem(i, { brand: e.target.value })} />
                    <Input className="col-span-2 h-8 text-xs" type="number" step="0.01" placeholder="Unit price" value={item.unitPrice} onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                    <Input className="col-span-1 h-8 text-xs" type="number" min="1" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(i, { quantity: parseInt(e.target.value) || 1 })} />
                    <Input className="col-span-2 h-8 text-xs" type="number" step="0.01" placeholder="Discount" value={item.discount} onChange={(e) => updateItem(i, { discount: parseFloat(e.target.value) || 0 })} />
                    <div className="col-span-1 flex items-center justify-end text-xs font-medium tabular-nums">
                      {lineCost(item).toLocaleString()}
                    </div>
                  </div>
                  <Input className="h-8 text-xs" placeholder="Clinical notes (optional)" value={item.clinicalNotes} onChange={(e) => updateItem(i, { clinicalNotes: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, { ...EMPTY_ITEM }])}>
                <Plus className="h-3 w-3 mr-1" /> Add Procedure
              </Button>
              <span className="text-sm">Total: <strong className="tabular-nums">{total.toLocaleString()}</strong></span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create Plan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
