'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// Mirrors the clinic's actual Bitrix24 lost-reason taxonomy (see
// migration/data/stage-dict.json's Category 2 stage names) so historical
// reporting concepts carry over instead of inventing generic new categories.
const LOST_REASONS = [
  { value: 'CHANGED_MIND', label: 'Changed his mind' },
  { value: 'NOT_QUALIFIED', label: 'Not qualified' },
  { value: 'NO_CONTACT', label: 'No call / no WhatsApp response' },
  { value: 'BUDGET', label: 'Not enough budget' },
  { value: 'OTHER', label: 'Other' },
];

export function LostReasonDialog({
  open,
  leadName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leadName: string;
  onCancel: () => void;
  onConfirm: (reason: string, note?: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setReason('');
    setNote('');
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  async function handleConfirm() {
    if (!reason) return;
    const label = LOST_REASONS.find((r) => r.value === reason)?.label ?? reason;
    setSubmitting(true);
    try {
      await onConfirm(label, note.trim() || undefined);
      reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Lost</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            Why is <span className="font-medium text-foreground">{leadName}</span> being marked as lost? Every lost
            deal needs a reason so the pipeline stays useful for reporting.
          </p>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any extra detail…" rows={3} />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!reason || submitting}>
            {submitting ? 'Moving…' : 'Move to Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
