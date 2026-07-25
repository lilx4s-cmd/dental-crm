'use client';

import { useState } from 'react';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { PipelineStage, TASK_DUE_LABELS, TaskDueFilter } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTransferLeads, useTransferPreview, type TransferPayload } from '@/hooks/use-leads';
import type { User } from '@/hooks/use-users';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  CLINIC_MANAGER: 'Clinic Manager',
  SALES_CONSULTANT: 'Sales',
  RECEPTION: 'Reception',
  DENTIST: 'Dentist',
};

// Radix reserves the empty string for "nothing selected", so "any" needs a value of its own.
const ANY = '__any__';

const humanStage = (stage: string) =>
  stage.charAt(0) + stage.slice(1).toLowerCase().replace(/_/g, ' ');

function userName(u?: User) {
  return u ? `${u.firstName} ${u.lastName}` : 'someone';
}

/**
 * Moves leads between salespeople.
 *
 * The selection is built from the same filters the pipeline board uses and resolved by the same
 * where-builder on the server, so "transfer what I filtered" moves exactly the set that was on
 * screen. Nothing is moved until the matching leads have been listed — bulk reassignment is
 * tedious to undo by hand, so the set is shown rather than described.
 */
export function TransferPanel({ users }: { users: User[] }) {
  const transfer = useTransferLeads();
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [stage, setStage] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [stuck, setStuck] = useState(false);
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fromUser = users.find((u) => u.id === fromUserId);
  const toUser = users.find((u) => u.id === toUserId);

  const payload: TransferPayload = {
    toUserId,
    fromUserId: fromUserId || undefined,
    stage: stage || undefined,
    taskDue: (taskDue || undefined) as TaskDueFilter | undefined,
    stuck: stuck || undefined,
    note: note.trim() || undefined,
  };

  // Something has to narrow the set. The API refuses an unfiltered transfer rather than reading it
  // as "everything", and the button follows the same rule so the two never disagree.
  const hasSelection = !!fromUserId || !!stage || !!taskDue || stuck;

  // The preview only needs the selection, so it runs before a destination is chosen.
  const { data: preview, isLoading: previewLoading } = useTransferPreview(
    { ...payload, toUserId: toUserId || users[0]?.id || '' },
    hasSelection && users.length > 0,
  );
  const matching = preview?.total ?? 0;
  const canReview = !!toUserId && hasSelection && fromUserId !== toUserId && matching > 0;

  const handleConfirm = () => {
    transfer.mutate(payload, {
      onSuccess: (result) => {
        toast.success(
          result.transferred > 0
            ? `Moved ${result.transferred} lead${result.transferred === 1 ? '' : 's'} to ${userName(toUser)}`
            : 'Nothing to move — those leads already belong to that salesperson',
        );
        setConfirmOpen(false);
        setFromUserId('');
        setToUserId('');
        setStage('');
        setTaskDue('');
        setStuck(false);
        setNote('');
      },
      onError: (err) => toast.error(err.message || 'Transfer failed'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer Leads</CardTitle>
        <CardDescription>
          Move leads between salespeople. Narrow by owner, stage or follow-up state, check the list,
          then commit. Closed (won/lost) leads keep their original owner so past results stay
          accurate — use this for handovers, not for editing history.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Select value={fromUserId || ANY} onValueChange={(v) => setFromUserId(v === ANY ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Anyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Anyone</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} · {ROLE_LABELS[u.role] ?? u.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden items-end justify-center pb-2.5 sm:flex">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="space-y-1.5">
            <Label>To</Label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select salesperson" />
              </SelectTrigger>
              <SelectContent>
                {users
                  .filter((u) => u.id !== fromUserId)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} · {ROLE_LABELS[u.role] ?? u.role}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select value={stage || ANY} onValueChange={(v) => setStage(v === ANY ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Any stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any stage</SelectItem>
                {Object.values(PipelineStage).map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanStage(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Follow-up</Label>
            <Select value={taskDue || ANY} onValueChange={(v) => setTaskDue(v === ANY ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {Object.values(TaskDueFilter).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TASK_DUE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={stuck} onCheckedChange={(c) => setStuck(c === true)} />
              No movement in 2 weeks
            </label>
          </div>
        </div>

        {hasSelection && (
          <div className="rounded-md border">
            <p className="border-b bg-muted/40 px-3 py-2 text-sm">
              {previewLoading ? (
                'Checking…'
              ) : (
                <>
                  <strong>{matching}</strong> lead{matching === 1 ? '' : 's'} match
                  {preview && preview.showing < matching && (
                    <span className="text-muted-foreground">
                      {' '}
                      · showing the first {preview.showing}
                    </span>
                  )}
                </>
              )}
            </p>
            {preview && preview.leads.length > 0 && (
              <ul className="max-h-48 divide-y overflow-y-auto text-sm">
                {preview.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate">
                      {l.firstName} {l.lastName ?? ''}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {humanStage(l.stage)}
                      {l.assignedTo && ` · ${l.assignedTo.firstName}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Note (optional)</Label>
          <Textarea
            placeholder="Reason for the reassignment — shown in the activity history"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex justify-end">
          <Button disabled={!canReview} onClick={() => setConfirmOpen(true)}>
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Review Transfer
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm transfer</DialogTitle>
            <DialogDescription>
              This moves <strong>{matching}</strong> lead{matching === 1 ? '' : 's'}
              {fromUser ? (
                <>
                  {' '}
                  from <strong>{userName(fromUser)}</strong>
                </>
              ) : null}{' '}
              to <strong>{userName(toUser)}</strong>. Each lead gets a history entry so this can be
              traced later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={transfer.isPending}>
              {transfer.isPending ? 'Transferring…' : 'Confirm Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
