'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays, Hash, HeartPulse, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useCaseFile, useUpdateCaseEconomics } from '@/hooks/use-case-file';
import { useUsers } from '@/hooks/use-users';

const money = (n: number, currency: string) =>
  `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          tone === 'good' && 'text-success',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The case as the clinic runs it: who this is, when they are in, and whether the work made money.
 *
 * Price and paid are read from the invoices and payments that already exist — this screen never
 * stores its own copy, so it cannot end up disagreeing with the finance page about how much a
 * patient has paid. Only the service cost and the commission are entered here.
 */
export function CasePlanningTab({ patientId }: { patientId: string }) {
  const { data, isLoading } = useCaseFile(patientId);
  const { data: users } = useUsers();
  const update = useUpdateCaseEconomics(patientId);

  const [serviceCost, setServiceCost] = useState('');
  const [commission, setCommission] = useState('');
  const [commissionUserId, setCommissionUserId] = useState('');

  // Reload from the server whenever it changes, so an edit elsewhere is not overwritten by a stale
  // form still holding the old numbers.
  useEffect(() => {
    if (!data) return;
    setServiceCost(data.patient.serviceCost == null ? '' : String(data.patient.serviceCost));
    setCommission(data.patient.salesCommission == null ? '' : String(data.patient.salesCommission));
    setCommissionUserId(data.patient.commissionUser?.id ?? '');
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const { economics: e, currency, invoices, appointments, patient } = data;
  const NOBODY = '__nobody__';

  const save = () => {
    update.mutate(
      {
        // Blank means "not recorded", which is different from zero — send undefined so the field
        // is left alone rather than being set to nothing.
        serviceCost: serviceCost.trim() === '' ? undefined : Number(serviceCost),
        salesCommission: commission.trim() === '' ? undefined : Number(commission),
        commissionUserId,
      },
      {
        onSuccess: () => toast.success('Case figures updated'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save'),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          {patient.caseNumber ?? 'No case number'}
        </span>
        {patient.aftercareStartedAt && (
          <Badge variant="success" className="gap-1">
            <HeartPulse className="h-3 w-3" />
            In after-care since {format(new Date(patient.aftercareStartedAt), 'd MMM yyyy')}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Treatment price" value={money(e.treatmentPrice, currency)} hint="Invoiced" />
        <Figure
          label="Paid"
          value={money(e.paid, currency)}
          hint={e.overpaid > 0 ? `${money(e.overpaid, currency)} overpaid` : `${money(e.outstanding, currency)} outstanding`}
          tone={e.outstanding === 0 && e.treatmentPrice > 0 ? 'good' : undefined}
        />
        <Figure label="Service cost" value={money(e.serviceCost, currency)} hint="What delivery costs" />
        <Figure
          label="Net profit"
          value={money(e.netProfit, currency)}
          hint={e.marginPercent === null ? 'Nothing invoiced yet' : `${e.marginPercent.toFixed(1)}% margin`}
          tone={e.netProfit >= 0 ? 'good' : 'bad'}
        />
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          {e.netProfit >= 0 ? (
            <TrendingUp className="h-4 w-4 text-success" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
          <h3 className="text-sm font-semibold">Case figures</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="service-cost">Service cost ({currency})</Label>
            <Input
              id="service-cost"
              type="number"
              min="0"
              step="0.01"
              placeholder="Lab, materials, hotel, transfers…"
              value={serviceCost}
              onChange={(ev) => setServiceCost(ev.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commission">Sales commission ({currency})</Label>
            <Input
              id="commission"
              type="number"
              min="0"
              step="0.01"
              value={commission}
              onChange={(ev) => setCommission(ev.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Commission earned by</Label>
            <Select
              value={commissionUserId || NOBODY}
              onValueChange={(v) => setCommissionUserId(v === NOBODY ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Nobody" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY}>Nobody</SelectItem>
                {users?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Profit is price − service cost − commission, taken from the invoiced price rather than
            what has been collected so far.
          </p>
          <Button size="sm" onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Receipt className="h-4 w-4" /> Invoices
        </h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing invoiced yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Invoice</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-3 py-2">{i.invoiceNumber}</td>
                    <td className="px-3 py-2 text-muted-foreground">{i.status.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(Number(i.total), currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(i.paid, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="h-4 w-4" /> Appointments
        </h3>
        {appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No appointments booked.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {format(new Date(a.startTime), 'EEE d MMM, HH:mm')}
                  <span className="ml-2 text-muted-foreground">{a.type.replace(/_/g, ' ').toLowerCase()}</span>
                </span>
                {a.dentist && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Dr. {a.dentist.firstName} {a.dentist.lastName}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{a.status.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
