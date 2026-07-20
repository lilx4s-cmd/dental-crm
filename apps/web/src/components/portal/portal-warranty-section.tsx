'use client';

import { format, addMonths } from 'date-fns';
import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { PortalPlanItem, PortalWarranty } from '@/hooks/use-portal';

const WARRANTY_STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'outline'> = {
  ACTIVE: 'success',
  EXPIRED: 'outline',
  VOIDED: 'destructive',
  CLAIMED: 'warning',
};

function WarrantyCard({ warranty }: { warranty: PortalWarranty }) {
  const expiresAt = addMonths(new Date(warranty.startDate), warranty.durationMonths);
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={warranty.id} className="rounded-md border px-3">
        <AccordionTrigger className="text-sm">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {warranty.durationMonths}-month warranty
            <Badge variant={WARRANTY_STATUS_VARIANT[warranty.status] ?? 'outline'}>{warranty.status}</Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-2 text-sm">
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

export function PortalWarrantySection({ items }: { items: PortalPlanItem[] }) {
  const withWarranties = items.filter((item) => item.warranties.length > 0);
  if (withWarranties.length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-semibold text-muted-foreground">Warranties</p>
      <div className="space-y-2">
        {withWarranties.map((item) => (
          <div key={item.id} className="space-y-1.5">
            <p className="text-sm font-medium">
              {item.description}
              {item.toothNumber && <span className="ml-1 text-muted-foreground">(tooth {item.toothNumber})</span>}
            </p>
            <div className="space-y-1.5 pl-2">
              {item.warranties.map((w) => (
                <WarrantyCard key={w.id} warranty={w} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
