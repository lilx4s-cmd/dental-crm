'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useWarrantyTemplates, useIssueWarranty } from '@/hooks/use-warranties';
import type { TreatmentPlanItem } from '@/hooks/use-treatment-plans';

export function IssueWarrantyDialog({
  patientId,
  item,
  open,
  onClose,
}: {
  patientId: string;
  item: TreatmentPlanItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: templates } = useWarrantyTemplates(true);
  const issue = useIssueWarranty(patientId);

  const [warrantyTemplateId, setWarrantyTemplateId] = useState('');
  const [durationMonths, setDurationMonths] = useState<number | ''>('');
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [maintenanceRequirements, setMaintenanceRequirements] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [annualCheckupRequired, setAnnualCheckupRequired] = useState(false);

  const selectedTemplate = templates?.find((t) => t.id === warrantyTemplateId);

  const reset = () => {
    setWarrantyTemplateId('');
    setDurationMonths('');
    setTermsAndConditions('');
    setMaintenanceRequirements('');
    setExclusions('');
    setAnnualCheckupRequired(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!item) return;
    if (!warrantyTemplateId && (!durationMonths || !termsAndConditions.trim())) {
      toast.error('Duration and terms are required when no template is selected');
      return;
    }
    issue.mutate(
      {
        itemId: item.id,
        warrantyTemplateId: warrantyTemplateId || undefined,
        durationMonths: durationMonths === '' ? undefined : Number(durationMonths),
        termsAndConditions: termsAndConditions.trim() || undefined,
        maintenanceRequirements: maintenanceRequirements.trim() || undefined,
        exclusions: exclusions.trim() || undefined,
        annualCheckupRequired: annualCheckupRequired || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Warranty issued');
          handleClose();
        },
        onError: () => toast.error('Failed to issue warranty'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue Warranty{item ? ` — ${item.description}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Warranty Template (optional)</Label>
            <Select value={warrantyTemplateId} onValueChange={setWarrantyTemplateId}>
              <SelectTrigger><SelectValue placeholder="Custom warranty (no template)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Custom warranty (no template)</SelectItem>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Duration (months){!warrantyTemplateId && ' *'}</Label>
            <Input
              type="number"
              min={1}
              placeholder={selectedTemplate ? String(selectedTemplate.durationMonths) : 'e.g. 24'}
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
            />
          </div>

          <div className="space-y-1">
            <Label>Terms & Conditions{!warrantyTemplateId && ' *'}</Label>
            <Textarea
              rows={3}
              placeholder={selectedTemplate?.termsAndConditions || 'Warranty terms shown to the patient'}
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Maintenance Requirements</Label>
            <Textarea
              rows={2}
              placeholder={selectedTemplate?.maintenanceRequirements || 'Optional'}
              value={maintenanceRequirements}
              onChange={(e) => setMaintenanceRequirements(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Exclusions</Label>
            <Textarea
              rows={2}
              placeholder={selectedTemplate?.exclusions || 'Optional'}
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="annual-checkup"
              checked={annualCheckupRequired}
              onCheckedChange={(v) => setAnnualCheckupRequired(v === true)}
            />
            <Label htmlFor="annual-checkup" className="cursor-pointer text-sm font-normal">
              Annual checkup required to maintain warranty
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={issue.isPending}>
            {issue.isPending ? 'Issuing…' : 'Issue Warranty'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
