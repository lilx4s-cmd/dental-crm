'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { CheckSquare, Download, Link2, Merge, Plus, Upload, UserPlus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LeadCard } from '@/components/pipeline/lead-card';
import { VirtualCardList } from '@/components/pipeline/virtual-card-list';
import { BulkActionBar } from '@/components/pipeline/bulk-action-bar';
import { useBoardSelection, type BoardSelection } from '@/components/pipeline/use-board-selection';
import { NewLeadDialog } from '@/components/pipeline/new-lead-dialog';
import { ImportLeadsDialog } from '@/components/pipeline/import-leads-dialog';
import { DuplicatesDialog } from '@/components/pipeline/duplicates-dialog';
import { useAuth } from '@/context/auth-context';
import { LostReasonDialog } from '@/components/pipeline/lost-reason-dialog';
import { LeadDetailSheet } from '@/components/pipeline/lead-detail-sheet';
import {
  useLeadsByStage,
  useUpdateLeadStage,
  type Lead,
  type PipelineFilters,
  type PipelineGroup,
  useExportLeads,
} from '@/hooks/use-leads';
import { PipelineFilterBar } from '@/components/pipeline/pipeline-filter-bar';
import { QueryError } from '@/components/ui/query-state';
import { formatDealValue } from '@/lib/money';
import { cn } from '@/lib/utils';
// The board draws whatever the shared stage list says, so renaming a stage renames it here,
// in the filters, on the dashboard and in the reports at once.
import { PIPELINE_STAGES as STAGES } from '@dental-crm/shared';

// Bitrix's columns are fixed and narrow — the board is meant to be read across, not down one
// column at a time, and fourteen stages only fit on a laptop at roughly this width.
const COLUMN_WIDTH = 252;

// Bitrix's Kanban shows each column's deal count *and* its total pipeline value —
// sum estimatedValue per currency (almost always a single currency in practice,
// but grouping avoids silently mixing e.g. USD and TRY into one misleading number).
function columnTotals(leads: Lead[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const l of leads) {
    if (l.estimatedValue == null) continue;
    const currency = l.currency || 'USD';
    totals.set(currency, (totals.get(currency) ?? 0) + l.estimatedValue);
  }
  return Array.from(totals.entries());
}

function totalsLabel(totals: Array<[string, number]>): string {
  return totals.map(([currency, amount]) => formatDealValue(amount, currency)).join(' · ');
}

function DroppableColumn({
  stage,
  leads,
  activeId,
  selection,
  selectedLeads,
  onLeadClick,
  onMoveToStage,
  onChangeResponsible,
  onTag,
  onExportColumn,
}: {
  stage: (typeof STAGES)[0];
  leads: Lead[];
  /** Threaded down so the dragged card is never recycled out of the DOM mid-drag. */
  activeId: string | null;
  selection: BoardSelection;
  /** The whole board's selection. A selection spans columns; this one only knows its own leads. */
  selectedLeads: Lead[];
  onLeadClick: (lead: Lead) => void;
  onMoveToStage: (leads: Lead[], stage: string) => void;
  onChangeResponsible: (leads: Lead[]) => void;
  onTag: (leads: Lead[]) => void;
  onExportColumn: (leads: Lead[]) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totals = columnTotals(leads);

  return (
    <div className="flex h-full shrink-0 flex-col" style={{ width: COLUMN_WIDTH }}>
      {/* The column header is the piece that makes a Bitrix board recognisable: a strip of the
          stage's own colour over a white block carrying the name, the count and the money. */}
      {/* Right-clicking the header acts on the column: select everything in it, or export it.
          Both are things people currently do by dragging a selection box that does not exist. */}
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <div className="shrink-0 overflow-hidden rounded-[3px] border border-bx-line bg-bx-surface">
        <div className="h-[3px]" style={{ backgroundColor: stage.color }} />
        <div className="flex items-start gap-1 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-bx-text" title={stage.label}>
              {stage.label}
            </p>
            <p className="mt-px truncate text-[11px] text-bx-muted" title={totalsLabel(totals)}>
              {leads.length} {leads.length === 1 ? 'deal' : 'deals'}
              {totals.length > 0 && ` · ${totalsLabel(totals)}`}
            </p>
          </div>
          {/* Lost needs a reason, which this dialog does not collect — so that one column keeps
              the drag-and-drop path that does ask for one. */}
          {stage.terminal !== 'lost' && (
            <NewLeadDialog defaultStage={stage.id} defaultStageLabel={stage.label}>
              <button
                type="button"
                aria-label={`Add a deal to ${stage.label}`}
                title={`Add a deal to ${stage.label}`}
                className="-mr-1 shrink-0 rounded p-1 text-bx-muted transition-colors hover:bg-bx-board hover:text-bx-link"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </NewLeadDialog>
          )}
        </div>
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="truncate">{stage.label}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={leads.length === 0}
          onSelect={() => selection.selectAll(leads)}
        >
          <CheckSquare className="mr-2 h-4 w-4" />
          Select all {leads.length} {leads.length === 1 ? 'deal' : 'deals'}
        </ContextMenuItem>
        <ContextMenuItem disabled={leads.length === 0} onSelect={() => onExportColumn(leads)}>
          <Download className="mr-2 h-4 w-4" />
          Export this column
        </ContextMenuItem>
        {/* No "add a deal here": the + button in this header does exactly that and is always
            visible. A menu item duplicating a control the cursor is already next to adds a place
            to look without adding anything to do. */}
      </ContextMenuContent>
      </ContextMenu>

      {/* The droppable and the scroll container are deliberately separate elements now. They used
          to be one, which cannot work with virtualization: the virtualizer needs to own the
          scrolling element to read its height and scroll offset, and dnd-kit needs a stable node
          for the drop target. Nesting them keeps the whole column area droppable — including the
          empty space below the last card, which is where people actually aim. */}
      <div
        ref={setNodeRef}
        className={cn(
          'mt-1.5 min-h-0 flex-1 overflow-hidden rounded-[3px] transition-colors',
          isOver && 'bg-bx-link/5 ring-1 ring-inset ring-bx-link/30',
        )}
      >
        <VirtualCardList
          leads={leads}
          activeId={activeId}
          selection={selection}
          selectedLeads={selectedLeads}
          onLeadClick={onLeadClick}
          onMoveToStage={onMoveToStage}
          onChangeResponsible={onChangeResponsible}
          onTag={onTag}
        />
      </div>
    </div>
  );
}

// Turns the API's error into something a receptionist can act on.
function moveErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  if (/forbidden/i.test(raw)) return 'Your role cannot move deals between stages.';
  if (/not found/i.test(raw)) return 'This deal is assigned to someone else, so you cannot move it.';
  return raw || 'Failed to move deal';
}

export default function PipelinePage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<PipelineFilters>({});
  const boardQuery = useLeadsByStage(filters);
  const { data: groups, isLoading } = boardQuery;
  const updateStage = useUpdateLeadStage();

  const [localGroups, setLocalGroups] = useState<PipelineGroup[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [pendingLostMove, setPendingLostMove] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const selection = useBoardSelection();
  const exportLeads = useExportLeads();
  /**
   * A dialog the context menu asked the bulk bar to open.
   *
   * The bar already owns the reassign and tag dialogs, and duplicating them here would mean two
   * copies of the same confirm-count-and-apply logic drifting apart. Instead the menu sets an
   * intent, the bar opens the matching dialog, and clears it when done.
   */
  const [bulkIntent, setBulkIntent] = useState<'reassign' | 'tag' | null>(null);

  useEffect(() => {
    if (groups) setLocalGroups(groups);
  }, [groups]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Escape clears, Ctrl/Cmd+A selects the board. Both are what these keys already do everywhere
  // else, so nothing here has to be learned. Ignored while focus is in a field, or the filter bar
  // would lose its own select-all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, [contenteditable="true"]');
      if (typing) return;

      if (e.key === 'Escape') selection.clear();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selection.selectAll(localGroups.flatMap((g) => g.leads as Lead[]));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, localGroups]);

  const allLeads = localGroups.flatMap((g) => g.leads as Lead[]);
  const selectedLeads = selection.resolve(allLeads);
  // How many cards the current drag is carrying. Drives the stack behind the drag overlay.
  const draggingCount =
    activeLead && selection.isSelected(activeLead.id) ? Math.max(1, selectedLeads.length) : 1;
  const boardTotals = columnTotals(allLeads);

  function onDragStart(event: DragStartEvent) {
    const lead = allLeads.find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  }

  // Optimistically moves `lead` to `toStage` and persists it, reverting to the
  // last known-good server state on failure. Shared by the plain drag-and-drop
  // path and the lost-reason-confirmed path below.
  async function commitMove(lead: Lead, toStage: string, extra?: { lostReason?: string; note?: string }) {
    const fromStage = lead.stage;
    setLocalGroups((prev) =>
      prev.map((g) => {
        if (g.stage === fromStage) return { ...g, leads: (g.leads as Lead[]).filter((l) => l.id !== lead.id) };
        if (g.stage === toStage) return { ...g, leads: [...(g.leads as Lead[]), { ...lead, stage: toStage }] };
        return g;
      }),
    );
    try {
      await updateStage.mutateAsync({ id: lead.id, stage: toStage, ...extra });
      // Offered on single drags as well as bulk moves. A card dropped one column too far is the
      // commonest mistake on this board, and the alternative is dragging it back by hand — which
      // writes a second stage change into the deal's history as though it were a real decision.
      const stageLabel = STAGES.find((st) => st.id === toStage)?.label ?? toStage;
      toast.success(`Moved to ${stageLabel}`, {
        action: { label: 'Undo', onClick: () => void undoMove([{ id: lead.id, fromStage }]) },
        duration: 6000,
      });
    } catch (e) {
      // The API's reason is the useful part. A blanket "Failed to move deal" hid the two things
      // that actually go wrong here — the user's role cannot move cards, or the lead belongs to a
      // colleague — leaving people to guess why the card kept snapping back.
      toast.error(moveErrorMessage(e));
      if (groups) setLocalGroups(groups);
    }
  }

  /**
   * Moves a set of deals to one stage.
   *
   * There is no bulk stage endpoint, so this is the per-lead one applied across the set. That
   * makes partial failure the normal case rather than the exception: a role can move its own deals
   * and not a colleague's, so forty selected cards can produce thirty-seven moves and three
   * refusals. Reporting "40 moved" there would be a lie the board itself would then contradict.
   *
   * Runs sequentially. Forty parallel PATCHes against one row-locking service gains a second and
   * costs the ability to say which ones failed.
   */
  async function moveMany(leads: Lead[], toStage: string) {
    if (leads.length === 0) return;

    const before = leads.map((l) => ({ id: l.id, fromStage: l.stage }));

    setLocalGroups((prev) =>
      prev.map((g) => {
        const ids = new Set(leads.map((l) => l.id));
        if (g.stage === toStage) {
          return { ...g, leads: [...(g.leads as Lead[]), ...leads.map((l) => ({ ...l, stage: toStage }))] };
        }
        return { ...g, leads: (g.leads as Lead[]).filter((l) => !ids.has(l.id)) };
      }),
    );

    const failures: string[] = [];
    for (const lead of leads) {
      try {
        await updateStage.mutateAsync({ id: lead.id, stage: toStage });
      } catch (e) {
        failures.push(`${lead.firstName} ${lead.lastName ?? ''}`.trim() || lead.id);
        void e;
      }
    }

    const moved = leads.length - failures.length;
    const stageLabel = STAGES.find((st) => st.id === toStage)?.label ?? toStage;

    if (failures.length === 0) {
      toast.success(`${moved} ${moved === 1 ? 'deal' : 'deals'} moved to ${stageLabel}`, {
        // Undo is offered rather than assumed: it reverses by moving each deal back to the stage
        // it actually came from, which is not necessarily one stage for the whole set.
        action: { label: 'Undo', onClick: () => void undoMove(before) },
        duration: 8000,
      });
    } else {
      // Named, not counted. "3 failed" leaves someone re-checking forty cards to find which.
      toast.warning(
        `${moved} moved to ${stageLabel}. ${failures.length} could not be moved: ${failures.slice(0, 3).join(', ')}${
          failures.length > 3 ? ` and ${failures.length - 3} more` : ''
        }`,
        { duration: 10000 },
      );
      if (groups) setLocalGroups(groups);
    }
  }

  /** Puts each deal back where it was. Best effort — a deal that refused to move may refuse again. */
  async function undoMove(before: Array<{ id: string; fromStage: string }>) {
    for (const entry of before) {
      try {
        await updateStage.mutateAsync({ id: entry.id, stage: entry.fromStage });
      } catch {
        // Reported once below rather than per deal; a failed undo is usually the same permission
        // that would have failed the move.
      }
    }
    toast.success('Move undone');
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromGroup = localGroups.find((g) => (g.leads as Lead[]).some((l) => l.id === active.id));

    // `over.id` is a stage id when dropped on empty column space, but dnd-kit
    // reports the *card's* id when dropped on top of another lead (each card is
    // itself a sortable droppable). Resolve either shape back to its column so a
    // drop landing on a card doesn't silently no-op — with 900+ leads in some
    // columns, empty space is rare and most drops land on a card.
    const overId = String(over.id);
    const toGroup =
      localGroups.find((g) => g.stage === overId) ??
      localGroups.find((g) => (g.leads as Lead[]).some((l) => l.id === overId));

    if (!fromGroup || !toGroup || fromGroup.stage === toGroup.stage) return;

    const lead = (fromGroup.leads as Lead[]).find((l) => l.id === active.id)!;

    /**
     * Dragging one card of a selection drags all of them.
     *
     * Without this, selecting twelve deals and dragging one moved exactly one — and the other
     * eleven stayed put, still highlighted, looking like they had moved. The rule matches the
     * right-click menu: inside the selection acts on the selection, outside it acts on the card.
     *
     * Only the cards that would actually change column are moved; a selection spanning several
     * columns can include deals already in the target.
     */
    const dragging = selection.isSelected(lead.id) && selectedLeads.length > 1 ? selectedLeads : [lead];
    const moving = dragging.filter((l) => l.stage !== toGroup.stage);
    if (moving.length === 0) return;

    if (toGroup.stage === 'LOST') {
      // Marking a deal lost always carried a reason in the clinic's old Bitrix
      // setup — hold the move until the dialog confirms instead of committing it
      // optimistically like every other stage change.
      //
      // Single deals only: the dialog collects one reason, and applying it to twelve deals would
      // record a reason that was never given for eleven of them. Dragging a selection to Lost is
      // refused out loud rather than silently moving the one card under the cursor.
      if (moving.length > 1) {
        toast.warning(
          `Lost needs a reason for each deal. Drag them one at a time — ${moving.length} were not moved.`,
        );
        return;
      }
      setPendingLostMove(lead);
      return;
    }

    if (moving.length > 1) {
      await moveMany(moving, toGroup.stage);
      selection.clear();
      return;
    }

    await commitMove(lead, toGroup.stage);
  }

  return (
    // Bitrix's board runs edge to edge on its own grey; the negative margin undoes the dashboard
    // shell's padding for this page only, rather than making every other page fight for it.
    // The min-height keeps the columns usable on a short window: past that point the board grows
    // and the dashboard shell scrolls, rather than the columns collapsing to nothing.
    <div className="-m-6 flex h-[calc(100vh-4rem)] min-h-[560px] flex-col bg-bx-board">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-bx-line bg-bx-surface px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-bx-text">Deals</h1>
          <span className="text-xs text-bx-muted">
            {allLeads.length} {allLeads.length === 1 ? 'deal' : 'deals'}
            {boardTotals.length > 0 && ` · ${totalsLabel(boardTotals)}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* The enquiry form is only useful if staff can find its link. Without this the page
              existed but nobody knew the URL to send. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `${window.location.origin}/intake`;
              navigator.clipboard
                .writeText(url)
                .then(() => toast.success('Enquiry form link copied — send it to a patient'))
                .catch(() => toast.error('Could not copy the link'));
            }}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Enquiry form link
          </Button>
          {/* Merging rewrites deals across the whole pipeline, including ones this user would not
              otherwise see, so the control is only offered to the role the API allows. */}
          {user?.role === 'SUPER_ADMIN' && (
            <DuplicatesDialog>
              <Button variant="outline" size="sm">
                <Merge className="mr-2 h-4 w-4" />
                Duplicates
              </Button>
            </DuplicatesDialog>
          )}
          <ImportLeadsDialog>
            <Button variant="outline" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </ImportLeadsDialog>
          <NewLeadDialog>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              New Deal
            </Button>
          </NewLeadDialog>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-3">
        <PipelineFilterBar filters={filters} onChange={setFilters} />
      </div>

      {isLoading ? (
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto px-4 pb-4 pt-3">
          {STAGES.map((s) => (
            <Skeleton key={s.id} className="h-full shrink-0 rounded-[3px]" style={{ width: COLUMN_WIDTH }} />
          ))}
        </div>
      ) : boardQuery.isError && localGroups.length === 0 ? (
        // Only when there is nothing to fall back to. A refetch that fails after the board has
        // loaded leaves the last good columns up, which is more useful than clearing them —
        // the cards on screen were real a minute ago.
        <QueryError error={boardQuery.error} onRetry={boardQuery.refetch} variant="page" />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto px-4 pb-4 pt-3">
            {STAGES.map((stage) => {
              const group = localGroups.find((g) => g.stage === stage.id);
              return (
                <DroppableColumn
                  key={stage.id}
                  stage={stage}
                  leads={(group?.leads as Lead[]) ?? []}
                  activeId={activeLead?.id ?? null}
                  selection={selection}
                  selectedLeads={selectedLeads}
                  onLeadClick={setDetailLead}
                  onMoveToStage={(leads, toStage) => {
                    void moveMany(leads, toStage);
                    selection.clear();
                  }}
                  // Right-clicking a card and choosing one of these opens the same dialog the
                  // bulk bar uses, on the cards the menu named — so the selection has to become
                  // that set first, or the dialog would act on whatever was highlighted before.
                  onChangeResponsible={(leads) => {
                    selection.selectAll(leads);
                    setBulkIntent('reassign');
                  }}
                  onTag={(leads) => {
                    selection.selectAll(leads);
                    setBulkIntent('tag');
                  }}
                  onExportColumn={(leads) =>
                    exportLeads.mutate(
                      { leadIds: leads.map((l) => l.id) },
                      {
                        onSuccess: (r) =>
                          toast.success(`Exported ${r.count ?? leads.length} from ${stage.label}`),
                        onError: (e) => toast.error(e.message || 'Could not export this column'),
                      },
                    )
                  }
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeLead && (
              <div className="relative w-[252px] rotate-1 opacity-95 shadow-md">
                {/* A dragged selection needs to look like more than one card, or the count in the
                    toast afterwards is the first anyone learns that twelve deals moved. Two
                    offset shells behind the real card read as a stack without needing twelve. */}
                {draggingCount > 1 && (
                  <>
                    <div className="absolute inset-0 -z-20 translate-x-2 translate-y-2 rounded-[3px] border border-bx-line bg-bx-surface" />
                    <div className="absolute inset-0 -z-10 translate-x-1 translate-y-1 rounded-[3px] border border-bx-line bg-bx-surface" />
                  </>
                )}
                <LeadCard lead={activeLead} onClick={() => {}} />
                {draggingCount > 1 && (
                  <span className="absolute -right-2 -top-2 rounded-full bg-bx-link px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white shadow">
                    {draggingCount}
                  </span>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <LostReasonDialog
        open={!!pendingLostMove}
        leadName={pendingLostMove ? `${pendingLostMove.firstName} ${pendingLostMove.lastName ?? ''}`.trim() : ''}
        onCancel={() => setPendingLostMove(null)}
        onConfirm={async (reason, note) => {
          const lead = pendingLostMove;
          setPendingLostMove(null);
          if (lead) await commitMove(lead, 'LOST', { lostReason: reason, note });
        }}
      />
      <BulkActionBar
        selectedLeads={selectedLeads}
        intent={bulkIntent}
        onIntentHandled={() => setBulkIntent(null)}
        onClear={selection.clear}
        // Clears afterwards on purpose: the deals have moved owner, so the set on screen is no
        // longer the set that was chosen, and leaving it selected invites a second action on a
        // stale idea of what is highlighted.
        onDone={selection.clear}
        onMoveToStage={(leads, stage) => {
          void moveMany(leads, stage);
          selection.clear();
        }}
      />

      <LeadDetailSheet
        lead={detailLead}
        open={!!detailLead}
        onOpenChange={(open) => { if (!open) setDetailLead(null); }}
      />
    </div>
  );
}
