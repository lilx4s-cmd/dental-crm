'use client';

import { useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { FlaskConical, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useCreateLabOrder,
  useLabOrders,
  useUpdateLabOrder,
  type LabOrder,
  type LabOrderStatus,
} from '@/hooks/use-lab-orders';

const STATUS_LABELS: Record<LabOrderStatus, string> = {
  DRAFT: 'Not sent',
  SENT: 'Sent',
  IN_PRODUCTION: 'In production',
  READY: 'Ready',
  RECEIVED: 'Back',
  REMAKE: 'Remake',
};

// Only two states are worth colouring: the case is back, or it needs remaking. Everything else is
// simply in progress, and colouring all of it would make the two that matter disappear.
const STATUS_STYLES: Record<LabOrderStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SENT: 'bg-muted text-muted-foreground',
  IN_PRODUCTION: 'bg-muted text-muted-foreground',
  READY: 'bg-muted text-muted-foreground',
  RECEIVED: 'bg-success-muted text-success-muted-foreground',
  REMAKE: 'bg-destructive-muted text-destructive-muted-foreground',
};

const OPEN: LabOrderStatus[] = ['DRAFT', 'SENT', 'IN_PRODUCTION', 'READY', 'REMAKE'];

/** How a due date reads once it is close, and after it has passed. */
function dueLabel(order: LabOrder): { text: string; late: boolean } | null {
  if (!order.dueAt || !OPEN.includes(order.status)) return null;
  const days = differenceInCalendarDays(new Date(order.dueAt), new Date());
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, late: true };
  if (days === 0) return { text: 'Due today', late: true };
  if (days === 1) return { text: 'Due tomorrow', late: false };
  return { text: `Due in ${days}d`, late: false };
}

/**
 * Cases sent out to the laboratory.
 *
 * The question this answers is the one a coordinator asks on the phone: will the bridge be back
 * before the patient flies home. Before this, lab work existed only as a lump sum on the case
 * economics — a number, with no case behind it.
 */
export function LabOrdersSection({ planId }: { planId: string }) {
  const { data: orders, isLoading } = useLabOrders(planId);
  const create = useCreateLabOrder(planId);
  const update = useUpdateLabOrder();

  const [adding, setAdding] = useState(false);
  const [labName, setLabName] = useState('');
  const [shade, setShade] = useState('');
  const [material, setMaterial] = useState('');
  const [teeth, setTeeth] = useState('');
  const [dueAt, setDueAt] = useState('');

  const reset = () => {
    setLabName('');
    setShade('');
    setMaterial('');
    setTeeth('');
    setDueAt('');
    setAdding(false);
  };

  const submit = () => {
    if (!labName.trim()) {
      toast.error('Which lab is this going to?');
      return;
    }
    create.mutate(
      {
        labName: labName.trim(),
        shade: shade.trim() || undefined,
        material: material.trim() || undefined,
        // Split on anything that is not a digit, so "11, 12 13" and "11/12/13" all work — nobody
        // should have to learn a separator to record four teeth.
        toothNumbers: teeth.split(/[^0-9]+/).filter(Boolean),
        dueAt: dueAt || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Lab order added');
          reset();
        },
        onError: (e) => toast.error(e.message || 'Could not add the lab order'),
      },
    );
  };

  const setStatus = (order: LabOrder, status: LabOrderStatus) =>
    update.mutate(
      { id: order.id, status },
      { onError: (e) => toast.error(e.message || 'Could not update') },
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" /> Laboratory
        </p>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" /> Send a case
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : orders && orders.length > 0 ? (
        <div className="space-y-1.5">
          {orders.map((order) => {
            const due = dueLabel(order);
            return (
              <div key={order.id} className="rounded-md border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{order.labName}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {due && (
                      <span
                        className={cn(
                          'text-xs',
                          due.late ? 'font-medium text-destructive-muted-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {due.text}
                      </span>
                    )}
                    <Select value={order.status} onValueChange={(v) => setStatus(order, v as LabOrderStatus)}>
                      <SelectTrigger className="h-7 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABELS) as LabOrderStatus[]).map((sVal) => (
                          <SelectItem key={sVal} value={sVal}>
                            {STATUS_LABELS[sVal]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className={STATUS_STYLES[order.status]}>
                    {STATUS_LABELS[order.status]}
                  </Badge>
                  {order.toothNumbers.length > 0 && <span>Teeth {order.toothNumbers.join(', ')}</span>}
                  {order.material && <span>{order.material}</span>}
                  {order.shade && <span>Shade {order.shade}</span>}
                  {order.sentAt && <span>Sent {format(new Date(order.sentAt), 'd MMM')}</span>}
                  {order.receivedAt && <span>Back {format(new Date(order.receivedAt), 'd MMM')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !adding && <p className="text-xs text-muted-foreground">No cases sent to the lab for this plan.</p>
      )}

      {adding && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Laboratory *</Label>
              <Input value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="Anadolu Dental Lab" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Due back</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Material</Label>
              <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Zirconia" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Shade</Label>
              <Input value={shade} onChange={(e) => setShade(e.target.value)} placeholder="A2" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Teeth</Label>
              <Input value={teeth} onChange={(e) => setTeeth(e.target.value)} placeholder="11, 12, 13" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
