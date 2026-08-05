'use client';

import { useState } from 'react';
import {
  Archive,
  ArrowRightLeft,
  Download,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PIPELINE_STAGES } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useUsers } from '@/hooks/use-users';
import {
  useBulkArchiveLeads,
  useBulkDeleteLeads,
  useBulkNoteLeads,
  useExportLeads,
  useTransferLeads,
  type Lead,
} from '@/hooks/use-leads';
import { cn } from '@/lib/utils';

/**
 * What you can do to a set of deals, without opening any of them.
 *
 * The layout is deliberately uneven. Reassign, move and note are the three anyone reaches for
 * daily, so they are buttons; archive, export and delete sit behind the overflow menu because
 * hitting one of those by accident on a selection of forty is expensive. Delete is separated from
 * the others and shown only to Super Admin, who is the only role the endpoint accepts.
 */
export function BulkActionBar({
  selectedLeads,
  onClear,
  onDone,
  onMoveToStage,
}: {
  selectedLeads: Lead[];
  onClear: () => void;
  onDone: () => void;
  onMoveToStage: (leads: Lead[], stage: string) => void;
}) {
  const { user } = useAuth();
  const [reassigning, setReassigning] = useState(false);
  const [noting, setNoting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const archive = useBulkArchiveLeads();
  const exportCsv = useExportLeads();

  const ids = selectedLeads.map((l) => l.id);
  const count = selectedLeads.length;
  const deals = `${count} ${count === 1 ? 'deal' : 'deals'}`;

  const runArchive = () =>
    archive.mutate(
      { leadIds: ids },
      {
        onSuccess: (r) => {
          if (r.changed === 0) {
            toast.info('Those deals were already archived.');
            return;
          }
          // The undo is real: the same endpoint restores, and the restore re-derives each deal's
          // outcome from its stage rather than reopening a closed sale.
          toast.success(`${r.changed} ${r.changed === 1 ? 'deal' : 'deals'} archived`, {
            action: {
              label: 'Undo',
              onClick: () =>
                archive.mutate(
                  { leadIds: ids, archived: false },
                  {
                    onSuccess: (u) => toast.success(`${u.changed} restored`),
                    onError: (e) => toast.error(e.message),
                  },
                ),
            },
          });
          onDone();
        },
        onError: (e) => toast.error(e.message || 'Could not archive these deals'),
      },
    );

  const runExport = () =>
    exportCsv.mutate(
      { leadIds: ids },
      {
        onSuccess: (r) => {
          // A short spreadsheet is the failure people never notice. If the server returned fewer
          // rows than were selected, the difference is deals belonging to somebody else — say so
          // rather than let the file look complete.
          if (r.count !== null && r.count < count) {
            toast.warning(`Exported ${r.count} of ${count} — the rest are not yours to export.`);
          } else {
            toast.success(`Exported ${r.count ?? count} ${(r.count ?? count) === 1 ? 'deal' : 'deals'}`);
          }
        },
        onError: (e) => toast.error(e.message || 'Could not export these deals'),
      },
    );

  if (count === 0) return null;

  return (
    <>
      {/* Floating rather than inline: the board scrolls horizontally, and a toolbar that scrolls
          away from the cards it acts on is one people lose. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-bx-surface px-3 py-2 shadow-lg">
          <span className="px-1 text-sm font-medium tabular-nums">{deals} selected</span>

          <div className="mx-1 h-5 w-px bg-border" />

          <Button size="sm" variant="outline" className="h-8" onClick={() => setReassigning(true)}>
            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
            Change responsible
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
                <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                Move to stage
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
              {PIPELINE_STAGES.map((stage) => (
                <DropdownMenuItem
                  key={stage.id}
                  onSelect={() => onMoveToStage(selectedLeads, stage.id)}
                  // Lost needs a reason per deal, and this menu collects none. Excluded rather
                  // than silently recording forty deals as lost with no explanation — the
                  // drag-and-drop path still asks properly, one at a time.
                  disabled={stage.terminal === 'lost'}
                >
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  {stage.label}
                  {stage.terminal === 'lost' && (
                    <span className="ml-2 text-xs text-muted-foreground">needs a reason</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" className="h-8" onClick={() => setNoting(true)}>
            <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
            Add note
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 px-2" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={runArchive} disabled={archive.isPending}>
                {archive.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                Archive {deals}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={runExport} disabled={exportCsv.isPending}>
                {exportCsv.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export to CSV
              </DropdownMenuItem>
              {/* Shown only to the role the endpoint accepts. A menu item that always answers 403
                  teaches people the app is unreliable rather than that they lack permission. */}
              {user?.role === 'SUPER_ADMIN' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setDeleting(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete permanently
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

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

      <NoteDialog
        open={noting}
        leads={selectedLeads}
        onClose={() => setNoting(false)}
        onDone={() => {
          setNoting(false);
          onDone();
        }}
      />

      <DeleteDialog
        open={deleting}
        leads={selectedLeads}
        onClose={() => setDeleting(false)}
        onDone={() => {
          setDeleting(false);
          onDone();
        }}
      />
    </>
  );
}

/**
 * One note, written to every selected deal's history.
 *
 * The note is stored as an activity rather than appended to the deal's free-text notes field, so
 * it carries a name and a time and cannot be overwritten by whoever is editing the deal at the
 * same moment. The dialog says so, because "add note" otherwise reads as editing the notes box.
 */
function NoteDialog({
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
  const addNote = useBulkNoteLeads();
  const [note, setNote] = useState('');

  const submit = () => {
    const text = note.trim();
    if (!text) return;
    addNote.mutate(
      { leadIds: leads.map((l) => l.id), note: text },
      {
        onSuccess: (r) => {
          toast.success(`Note added to ${r.noted} ${r.noted === 1 ? 'deal' : 'deals'}`);
          setNote('');
          onDone();
        },
        onError: (e) => toast.error(e.message || 'Could not add the note'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a note to {leads.length} {leads.length === 1 ? 'deal' : 'deals'}</DialogTitle>
          <DialogDescription>
            It goes into each deal&rsquo;s history with your name and the time, alongside the stage
            changes — not into the notes box on the deal itself.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          autoFocus
          rows={4}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Called about the November group — all waiting on flight prices."
          aria-label="Note"
          // Ctrl/Cmd+Enter submits: this is a box people type a sentence into and leave, and
          // reaching for the mouse for a one-line note is most of the cost of using it.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
        />

        <DialogFooter className="items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">{note.length}/2000</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!note.trim() || addNote.isPending}>
              {addNote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to {leads.length}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Permanent deletion, behind a typed confirmation.
 *
 * A checkbox or a red button is not enough here. Every other action on this bar is reversible —
 * archiving has an undo, a note can be ignored, a reassignment can be reassigned back — and this
 * one is not, so the gesture that performs it should not resemble the gestures that do.
 *
 * The server refuses deals that became patients or that survived a merge. That is stated up front
 * rather than left to arrive as an error, because someone who reads it first will archive instead.
 */
function DeleteDialog({
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
  const remove = useBulkDeleteLeads();
  const [typed, setTyped] = useState('');

  const confirmed = typed.trim().toUpperCase() === 'DELETE';

  const submit = () => {
    if (!confirmed) return;
    remove.mutate(
      { leadIds: leads.map((l) => l.id) },
      {
        onSuccess: (r) => {
          toast.success(`${r.deleted} ${r.deleted === 1 ? 'deal' : 'deals'} deleted`);
          setTyped('');
          onDone();
        },
        onError: (e) => toast.error(e.message || 'Could not delete these deals'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (setTyped(''), onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Delete {leads.length} {leads.length === 1 ? 'deal' : 'deals'} permanently
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. Their tasks and stage history go with them; WhatsApp threads and
            call logs stay, detached from any deal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            Deals that became patients, and deals other duplicates were merged into, will be
            refused. Archive those instead — deleting them would cut a patient record off from
            where it came from.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="confirm-delete" className="text-sm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </label>
            <Input
              id="confirm-delete"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder="DELETE"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => (setTyped(''), onClose())}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={!confirmed || remove.isPending}
          >
            {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete {leads.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
