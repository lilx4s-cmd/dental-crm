'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Merge } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_LABELS, type DuplicateGroup, type MergeDuplicatesResult } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDealValue } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useDuplicateGroups, useMergeDuplicates } from '@/hooks/use-leads';

/** Last six digits are enough to recognise a number without printing patients' phones in full. */
function maskNumber(number: string): string {
  return number.length > 6 ? `…${number.slice(-6)}` : number;
}

function GroupRow({
  group,
  survivorId,
  onPickSurvivor,
}: {
  group: DuplicateGroup;
  survivorId: string;
  onPickSurvivor: (leadId: string) => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{maskNumber(group.number)}</span>
        <span className="text-xs text-muted-foreground">
          {group.leads.length} deals
          {group.repeatTreatment && (
            <span className="ml-2 rounded bg-warning-muted px-1.5 py-0.5 text-warning-muted-foreground">
              Looks like a returning patient
            </span>
          )}
        </span>
      </div>

      <div className="space-y-1">
        {group.leads.map((lead) => {
          const keep = lead.id === survivorId;
          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => onPickSurvivor(lead.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                keep ? 'bg-success-muted text-success-muted-foreground' : 'hover:bg-muted',
              )}
            >
              <span className={cn('w-12 shrink-0 font-medium', !keep && 'text-muted-foreground')}>
                {keep ? 'Keep' : 'Fold in'}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {`${lead.firstName} ${lead.lastName ?? ''}`.trim()}
              </span>
              <span className="w-28 shrink-0 truncate">{STAGE_LABELS[lead.stage] ?? lead.stage}</span>
              <span className="w-20 shrink-0 truncate text-right tabular-nums">
                {lead.estimatedValue != null ? formatDealValue(lead.estimatedValue, lead.currency ?? 'USD') : '—'}
              </span>
              <span className="w-24 shrink-0 truncate text-right text-muted-foreground">
                {lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : 'Unassigned'}
              </span>
              {lead.hasPatient && (
                <span className="shrink-0 rounded bg-info-muted px-1.5 py-0.5 text-info-muted-foreground">
                  patient
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Review and merge deals that share a number.
 *
 * Everything here exists because the merge cannot be undone by pressing back. The survivor is a
 * suggestion, not a decision — clicking any deal in a group makes it the one that stays. Groups
 * that look like a returning patient are excluded unless somebody deliberately includes them, and
 * a deal that already became a patient is never folded in whatever is selected.
 */
export function DuplicatesDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [survivors, setSurvivors] = useState<Record<string, string>>({});
  const [includeRepeatTreatment, setIncludeRepeatTreatment] = useState(false);
  const [preview, setPreview] = useState<MergeDuplicatesResult | null>(null);
  const [done, setDone] = useState<MergeDuplicatesResult | null>(null);

  const { data: groups, isLoading } = useDuplicateGroups(open);
  const merge = useMergeDuplicates();

  const eligible = useMemo(
    () => (groups ?? []).filter((g) => includeRepeatTreatment || !g.repeatTreatment),
    [groups, includeRepeatTreatment],
  );

  // Mirrors the server's own arithmetic: everything in an eligible group except its survivor, minus
  // any deal that already became a patient.
  const wouldFold = useMemo(
    () =>
      eligible.reduce((total, g) => {
        const keep = survivors[g.number] ?? g.suggestedSurvivorId;
        return total + g.leads.filter((l) => l.id !== keep && !l.hasPatient).length;
      }, 0),
    [eligible, survivors],
  );

  const payload = (dryRun: boolean) => ({
    dryRun,
    survivors,
    includeRepeatTreatment,
    numbers: eligible.map((g) => g.number),
  });

  const runPreview = () =>
    merge.mutate(payload(true), {
      onSuccess: setPreview,
      onError: (e) => toast.error(e.message || 'Preview failed'),
    });

  const runMerge = () =>
    merge.mutate(payload(false), {
      onSuccess: (res) => {
        setDone(res);
        setPreview(null);
        toast.success(`${res.merged} duplicate deal${res.merged === 1 ? '' : 's'} folded away`);
      },
      onError: (e) => toast.error(e.message || 'Merge failed'),
    });

  const close = () => {
    setOpen(false);
    setPreview(null);
    setDone(null);
    setSurvivors({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <span onClick={() => setOpen(true)}>{children}</span>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Deals sharing a number</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <strong>{done.merged}</strong> deals folded into <strong>{done.groups}</strong> survivors.
            </p>
            <p className="text-xs text-muted-foreground">
              Nothing was deleted. Each folded deal still exists, points at the deal it went into, and
              its tasks, messages and history now hang off that one.
            </p>
            {done.skipped.length > 0 && (
              <div className="max-h-52 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs">
                <p className="mb-1.5 font-medium">Left alone:</p>
                <ul className="space-y-0.5">
                  {done.skipped.map((s) => (
                    <li key={s.number}>
                      {maskNumber(s.number)} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : !groups || groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No two deals share a number. Nothing to clean up.
          </p>
        ) : (
          <>
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                <strong>{groups.length}</strong> numbers appear on more than one deal.{' '}
                <strong>{wouldFold}</strong> deals would be folded away, leaving one per number.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The deal marked <span className="font-medium">Keep</span> is the furthest along its
                pipeline. Click any other deal in a group to keep that one instead. Nothing is
                deleted — folded deals keep their history and move it onto the survivor.
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={includeRepeatTreatment}
                onCheckedChange={(c) => setIncludeRepeatTreatment(c === true)}
              />
              <span>
                Also merge groups that look like a returning patient
                <span className="block text-xs text-muted-foreground">
                  Two completed treatments on one number is usually implants last year and crowns
                  this year. Merging those destroys the record of the first.
                </span>
              </span>
            </label>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {eligible.map((g) => (
                <GroupRow
                  key={g.number}
                  group={g}
                  survivorId={survivors[g.number] ?? g.suggestedSurvivorId}
                  onPickSurvivor={(leadId) =>
                    setSurvivors((s: Record<string, string>) => ({ ...s, [g.number]: leadId }))
                  }
                />
              ))}
            </div>

            {preview && (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-warning-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Preview: <strong>{preview.merged}</strong> deals would be folded into{' '}
                  <strong>{preview.groups}</strong> survivors
                  {preview.skipped.length > 0 && `, ${preview.skipped.length} groups left alone`}. Nothing
                  has changed yet.
                </span>
              </p>
            )}

            <DialogFooter className="items-center justify-between sm:justify-between">
              <span className="text-xs text-muted-foreground">This cannot be undone from the app.</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={runPreview} disabled={merge.isPending}>
                  {merge.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Preview
                </Button>
                <Button onClick={runMerge} disabled={merge.isPending || wouldFold === 0}>
                  <Merge className="mr-2 h-4 w-4" />
                  Merge {wouldFold} deals
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
