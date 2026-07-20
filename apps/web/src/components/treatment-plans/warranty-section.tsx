'use client';

import { useState } from 'react';
import { format, addMonths } from 'date-fns';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

import { usePatientWarranties, type Warranty } from '@/hooks/use-warranties';
import type { TreatmentPlan, TreatmentPlanItem } from '@/hooks/use-treatment-plans';
import { IssueWarrantyDialog } from './issue-warranty-dialog';

const WARRANTY_STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'outline'> = {
  ACTIVE: 'success',
  EXPIRED: 'outline',
  VOIDED: 'destructive',
  CLAIMED: 'warning',
};

function WarrantyCard({ warranty }: { warranty: Warranty }) {
  const expiresAt = addMonths(new Date(warranty.startDate), warranty.durationMonths);
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={warranty.id} className="rounded-md border px-3">
        <AccordionTrigger className="text-xs">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            {warranty.warrantyTemplate?.name ?? 'Custom warranty'} · {warranty.durationMonths} mo
            <Badge variant={WARRANTY_STATUS_VARIANT[warranty.status] ?? 'outline'}>{warranty.status}</Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-1.5 text-xs">
          <p className="text-muted-foreground">
            {format(new Date(warranty.startDate), 'MMM d, yyyy')} – {format(expiresAt, 'MMM d, yyyy')}
          </p>
          <div>
            <p className="font-semibold text-muted-foreground">Terms & Conditions</p>
            <p className="whitespace-pre-wrap">{warranty.termsAndConditions}</p>
          </div>
          {warranty.maintenanceRequirements && (
            <div>
              <p className="font-semibold text-muted-foreground">Maintenance Requirements</p>
              <p className="whitespace-pre-wrap">{warranty.maintenanceRequirements}</p>
            </div>
          )}
          {warranty.exclusions && (
            <div>
              <p className="font-semibold text-muted-foreground">Exclusions</p>
              <p className="whitespace-pre-wrap">{warranty.exclusions}</p>
            </div>
          )}
          {warranty.annualCheckupRequired && (
            <p className="text-muted-foreground">Annual checkup required to maintain warranty.</p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// Renders, per COMPLETED plan item, any issued warranties plus an "Issue Warranty" action.
// The COMPLETED gate is UI-level only — the backend allows issuing against any item.
export function WarrantySection({ plan, patientId }: { plan: TreatmentPlan; patientId: string }) {
  const { data: warranties } = usePatientWarranties(patientId);
  const [issueItem, setIssueItem] = useState<TreatmentPlanItem | null>(null);

  const completedItems = plan.items.filter((item) => item.status === 'COMPLETED');
  if (completedItems.length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-semibold text-muted-foreground">Warranties</p>
      <div className="space-y-2">
        {completedItems.map((item) => {
          const itemWarranties = warranties?.filter((w) => w.treatmentPlanItemId === item.id) ?? [];
          return (
            <div key={item.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  {item.description}
                  {item.toothNumber && <span className="ml-1 text-muted-foreground">(tooth {item.toothNumber})</span>}
                </span>
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setIssueItem(item)}>
                  Issue Warranty
                </Button>
              </div>
              {itemWarranties.length > 0 && (
                <div className="space-y-1.5 pl-2">
                  {itemWarranties.map((w) => (
                    <WarrantyCard key={w.id} warranty={w} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <IssueWarrantyDialog
        patientId={patientId}
        item={issueItem}
        open={!!issueItem}
        onClose={() => setIssueItem(null)}
      />
    </div>
  );
}
