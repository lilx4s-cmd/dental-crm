'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PACKAGE_INCLUSIONS, computePaymentSummary } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { num } from '@/lib/numeric-input';
import { cn } from '@/lib/utils';
import { useUpdateTreatmentPlan, type TreatmentPlan } from '@/hooks/use-treatment-plans';
import { formatMoney } from '@/lib/money';

const money = formatMoney;

/**
 * What the price includes and how it is paid, on one panel.
 *
 * Both already print on the dossier and neither could be set from anywhere, so every plan carried
 * whatever the clinic defaults happened to be when it was created. This is the screen that makes
 * those two pages real.
 *
 * Numeric fields are held as text and converted on save — see `@/lib/numeric-input` for why a
 * controlled number input cannot be emptied.
 */
export function PackagePaymentSection({ plan, patientId }: { plan: TreatmentPlan; patientId: string }) {
  const update = useUpdateTreatmentPlan(patientId);

  const [included, setIncluded] = useState<string[]>(plan.packageIncludes ?? []);
  const [deposit, setDeposit] = useState(plan.depositAmount != null ? String(plan.depositAmount) : '');
  const [cardFee, setCardFee] = useState(plan.cardFeePercent != null ? String(plan.cardFeePercent) : '');
  const [cashDiscount, setCashDiscount] = useState(
    plan.cashDiscountPercent != null ? String(plan.cashDiscountPercent) : '',
  );
  const [flightNote, setFlightNote] = useState(plan.flightRefundNote ?? '');
  const [terms, setTerms] = useState(plan.paymentTerms ?? '');

  // The same function the dossier prints from, so what a coordinator sees here is exactly what the
  // patient receives — not a second opinion about what a surcharge comes to.
  const summary = useMemo(
    () =>
      computePaymentSummary({
        total: Number(plan.totalCost) || 0,
        depositAmount: deposit === '' ? null : num(deposit),
        cardFeePercent: cardFee === '' ? null : num(cardFee),
        cashDiscountPercent: cashDiscount === '' ? null : num(cashDiscount),
      }),
    [plan.totalCost, deposit, cardFee, cashDiscount],
  );

  const toggle = (key: string) =>
    setIncluded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = () =>
    update.mutate(
      {
        id: plan.id,
        packageIncludes: included,
        // An empty box means "not quoted", which is different from zero — sending 0 would print
        // "no deposit required" on a document the patient keeps.
        depositAmount: deposit === '' ? undefined : num(deposit),
        cardFeePercent: cardFee === '' ? undefined : num(cardFee),
        cashDiscountPercent: cashDiscount === '' ? undefined : num(cashDiscount),
        flightRefundNote: flightNote || undefined,
        paymentTerms: terms || undefined,
      },
      {
        onSuccess: () => toast.success('Package and payment saved'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save'),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What&apos;s included &amp; payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-xs text-muted-foreground">Included in the price</Label>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {PACKAGE_INCLUSIONS.map((item) => {
              const on = included.includes(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggle(item.key)}
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    on ? 'border-success bg-success-muted text-success-muted-foreground' : 'hover:bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      on ? 'border-success bg-success text-success-foreground' : 'border-input',
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span>
                    <span className="font-medium">{item.label}</span>
                    <span className="block text-xs opacity-80">{item.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Deposit ({plan.currency})</Label>
            <Input type="number" step="0.01" min="0" placeholder="0.00" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Card fee %</Label>
            <Input type="number" step="0.1" min="0" max="100" placeholder="16" value={cardFee} onChange={(e) => setCardFee(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Cash discount %</Label>
            <Input type="number" step="0.1" min="0" max="100" placeholder="0" value={cashDiscount} onChange={(e) => setCashDiscount(e.target.value)} />
          </div>
        </div>

        {/* Exactly what the payment page will print. Shown live because the card surcharge on a
            full-mouth case is worth hundreds, and a coordinator quoting it should see the figure
            before the patient does. */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Payable in cash</span>
            <span className="font-semibold">{money(summary.cashTotal, plan.currency)}</span>
          </div>
          {summary.deposit > 0 && (
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">Remaining on arrival</span>
              <span>{money(summary.remaining, plan.currency)}</span>
            </div>
          )}
          {summary.cardFeePercent > 0 && (
            <div className="mt-1 flex items-center justify-between text-warning-muted-foreground">
              <span>By card (+{summary.cardFeePercent}%)</span>
              <span>
                {money(summary.cardTotal, plan.currency)} · +{money(summary.cardExtra, plan.currency)}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Flight note (optional)</Label>
          <Input
            placeholder="If a card fee is applied, the clinic refunds the flight ticket."
            value={flightNote}
            onChange={(e) => setFlightNote(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Payment terms (optional)</Label>
          <Textarea
            rows={2}
            placeholder="The final price may vary if clinical findings require additional procedures."
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
