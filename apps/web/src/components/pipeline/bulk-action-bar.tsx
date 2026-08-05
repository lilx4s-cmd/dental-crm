'use client';

import { useState } from 'react';
import { Loader2, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUsers } from '@/hooks/use-users';
import { useTransferLeads, type Lead } from '@/hooks/use-leads';
import { cn } from '@/lib/utils';

/**
 * What you can do to a set of deals, without opening any of them.
 *
 * Bulk reassignment already existed — `POST /leads/transfer` takes `leadIds`, and has done since
 * the transfer panel was built — but the only way to reach it was the Team page, which is not
 * where anyone is when they decide forty deals belong to somebody else. This is the same endpoint,
 * put where the work happens.
 *
 * Only reassignment is wired for now. The other bulk actions in the brief (tag, note, stage,
 * archive, export) each need an endpoint that does not exist yet, and a button that reports
 * success without doing anything is worse than no button.
 */
export function BulkActionBar({
  selectedLeads,
  onClear,
  onDone,
}: {
  selectedLeads: Lead[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [reassigning, setReassigning] = useState(false);

  if (selectedLeads.length === 0) return null;

  return (
    <>
      {/* Floating rather than inline: the board scrolls horizontally, and a toolbar that scrolls
          away from the cards it acts on is one people lose. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-bx-surface px-3 py-2 shadow-lg">
          <span className="px-1 text-sm font-medium tabular-nums">
            {selectedLeads.length} {selectedLeads.length === 1 ? 'deal' : 'deals'} selected
          </span>

          <div className="mx-1 h-5 w-px bg-border" />

          <Button size="sm" variant="outline" className="h-8" onClick={() => setReassigning(true)}>
            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
            Change responsible
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ReassignDialog
        open={reassigning}
        leads={selectedLeads}
        onClose={() => setReassigning(false)}
        onDone={() => {
          setReassigning(false);
          onDone();
        }}
      />
    </>
  );
}

/**
 * Pick someone, see exactly how many deals move, confirm.
 *
 * The count is stated before the button rather than after the action, because a bulk reassignment
 * is hard to undo by hand: there is no "give them back" button, only forty individual edits.
 */
function ReassignDialog({
  open,
  leads,
  onClose,
  onDone,
}: {
  open: boolean;
  leads: Lead[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: users, isLoading } = useUsers();
  const transfer = useTransferLeads();
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);

  const term = search.trim().toLowerCase();
  const matches = (users ?? []).filter((u) => {
    if (!u.isActive) return false;
    if (!term) return true;
    return `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(term);
  });

  const chosenUser = users?.find((u) => u.id === chosen);

  const submit = () => {
    if (!chosen) return;
    transfer.mutate(
      { toUserId: chosen, leadIds: leads.map((l) => l.id) },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.transferred} ${result.transferred === 1 ? 'deal' : 'deals'} reassigned to ${
              chosenUser ? `${chosenUser.firstName} ${chosenUser.lastName}` : 'the new owner'
            }`,
          );
          setChosen(null);
          setSearch('');
          onDone();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not reassign these deals'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change responsible person</DialogTitle>
          <DialogDescription>
            {leads.length} {leads.length === 1 ? 'deal' : 'deals'} will move. Each one keeps its
            stage and its history — the change is recorded against it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            autoFocus
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search for a person"
          />

          <div className="max-h-56 overflow-y-auto rounded-md border">
            {isLoading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading people…</p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nobody matches &ldquo;{search.trim()}&rdquo;.
              </p>
            ) : (
              matches.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setChosen(u.id)}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                    chosen === u.id && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span>
                    {u.firstName} {u.lastName}
                    <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="text-xs capitalize text-muted-foreground">
                    {u.role.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {chosenUser
              ? `${leads.length} → ${chosenUser.firstName} ${chosenUser.lastName}`
              : 'Choose who takes them on'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!chosen || transfer.isPending}>
              {transfer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reassign {leads.length}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
