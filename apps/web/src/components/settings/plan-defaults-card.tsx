'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PACKAGE_INCLUSIONS } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { num } from '@/lib/numeric-input';
import { cn } from '@/lib/utils';
import { useClinicSettings, useUpdateClinicSettings } from '@/hooks/use-reports';

/**
 * The terms every new treatment plan starts from.
 *
 * Set once here, copied onto each plan when it is created. Copied rather than referenced, so
 * raising the card fee in June never rewrites a proposal sent in March — the patient holds a
 * document, and that document has to keep being true.
 *
 * This is the screen that makes a proposal a two-minute job: without it a coordinator retypes the
 * same package and the same terms into every plan, which is both the slow part and the reason two
 * patients end up holding different terms.
 */
export function PlanDefaultsCard() {
  const { data, isLoading } = useClinicSettings();
  const update = useUpdateClinicSettings();

  const [included, setIncluded] = useState<string[]>([]);
  const [cardFee, setCardFee] = useState('');
  const [cashDiscount, setCashDiscount] = useState('');
  const [depositPercent, setDepositPercent] = useState('');
  const [terms, setTerms] = useState('');
  const [warranty, setWarranty] = useState('');

  // Populated once the settings arrive. Without this the fields render empty and a save would
  // wipe values the clinic had already set.
  useEffect(() => {
    if (!data) return;
    setIncluded(data.defaultPackageIncludes ?? []);
    setCardFee(data.defaultCardFeePercent != null ? String(data.defaultCardFeePercent) : '');
    setCashDiscount(data.defaultCashDiscountPercent != null ? String(data.defaultCashDiscountPercent) : '');
    setDepositPercent(data.defaultDepositPercent != null ? String(data.defaultDepositPercent) : '');
    setTerms(data.defaultPaymentTerms ?? '');
    setWarranty(data.defaultWarrantyTerms ?? '');
  }, [data]);

  const toggle = (key: string) =>
    setIncluded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = () =>
    update.mutate(
      {
        defaultPackageIncludes: included,
        // Empty means "we do not quote this", which is not the same as zero.
        defaultCardFeePercent: cardFee === '' ? undefined : num(cardFee),
        defaultCashDiscountPercent: cashDiscount === '' ? undefined : num(cashDiscount),
        defaultDepositPercent: depositPercent === '' ? undefined : num(depositPercent),
        defaultPaymentTerms: terms || undefined,
        defaultWarrantyTerms: warranty || undefined,
      },
      {
        onSuccess: () => toast.success('Defaults saved — new plans will start from these'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save'),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Treatment plan defaults</CardTitle>
        <CardDescription>
          What every new plan starts with. Existing plans keep the terms they were created with, so
          changing these never alters a proposal already sent to a patient.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div>
              <Label className="text-xs text-muted-foreground">Included in every package</Label>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {PACKAGE_INCLUSIONS.map((item) => {
                  const on = included.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggle(item.key)}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        on ? 'border-success bg-success-muted text-success-muted-foreground' : 'hover:bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          on ? 'border-success bg-success text-success-foreground' : 'border-input',
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Card fee %</Label>
                <Input type="number" step="0.1" min="0" max="100" placeholder="16" value={cardFee} onChange={(e) => setCardFee(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cash discount %</Label>
                <Input type="number" step="0.1" min="0" max="100" placeholder="0" value={cashDiscount} onChange={(e) => setCashDiscount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Deposit %</Label>
                <Input type="number" step="1" min="0" max="100" placeholder="20" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
                {/* Configured as a share, quoted as a sum: "500 USD to reserve your dates" is
                    answerable, "20%" is arithmetic the patient has to do. */}
                <p className="text-[11px] text-muted-foreground">Turned into an amount on each plan.</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Payment terms</Label>
              <Textarea
                rows={2}
                placeholder="The final price may vary if clinical findings require additional procedures."
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Warranty terms</Label>
              <Textarea
                rows={2}
                placeholder="Shown on warranty certificates issued for this clinic's work."
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={update.isPending}>
                {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save defaults
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
