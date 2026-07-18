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
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LeadCard } from '@/components/pipeline/lead-card';
import { NewLeadDialog } from '@/components/pipeline/new-lead-dialog';
import { useLeadsByStage, useUpdateLeadStage, type Lead, type PipelineGroup } from '@/hooks/use-leads';

const STAGES = [
  { id: 'NEW_LEAD', label: 'New Lead', color: 'border-indigo-400' },
  { id: 'CONTACTED', label: 'Contacted', color: 'border-purple-400' },
  { id: 'QUALIFIED', label: 'Qualified', color: 'border-violet-400' },
  { id: 'CONSULTATION_SCHEDULED', label: 'Consult Sched.', color: 'border-blue-400' },
  { id: 'CONSULTATION_DONE', label: 'Consult Done', color: 'border-cyan-400' },
  { id: 'TREATMENT_PROPOSED', label: 'Treatment Proposed', color: 'border-teal-400' },
  { id: 'NEGOTIATION', label: 'Negotiation', color: 'border-amber-400' },
  { id: 'WON', label: 'Won', color: 'border-green-400' },
  { id: 'LOST', label: 'Lost', color: 'border-red-400' },
];

function DroppableColumn({
  stage,
  leads,
  onLeadClick,
}: {
  stage: (typeof STAGES)[0];
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border-t-4 ${stage.color} bg-muted/40 min-h-[300px] transition-colors ${isOver ? 'bg-muted/70' : ''}`}
      style={{ minWidth: 220, width: 220 }}
    >
      <div className="px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stage.label}</span>
          <span className="text-xs font-bold tabular-nums bg-background rounded-full px-1.5 py-0.5">{leads.length}</span>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead)} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground/60">Drop here</div>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data: groups, isLoading } = useLeadsByStage();
  const updateStage = useUpdateLeadStage();

  const [localGroups, setLocalGroups] = useState<PipelineGroup[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (groups) setLocalGroups(groups);
  }, [groups]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragStart(event: DragStartEvent) {
    const lead = localGroups.flatMap((g) => g.leads as Lead[]).find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromGroup = localGroups.find((g) => (g.leads as Lead[]).some((l) => l.id === active.id));
    const toStageId = String(over.id);
    const toGroup = localGroups.find((g) => g.stage === toStageId);

    if (!fromGroup || !toGroup || fromGroup.stage === toGroup.stage) return;

    const lead = (fromGroup.leads as Lead[]).find((l) => l.id === active.id)!;

    // Optimistic update
    setLocalGroups((prev) =>
      prev.map((g) => {
        if (g.stage === fromGroup.stage) return { ...g, leads: (g.leads as Lead[]).filter((l) => l.id !== active.id) };
        if (g.stage === toGroup.stage) return { ...g, leads: [...(g.leads as Lead[]), { ...lead, stage: toStageId }] };
        return g;
      }),
    );

    try {
      await updateStage.mutateAsync({ id: String(active.id), stage: toStageId });
    } catch {
      toast.error('Failed to move lead');
      if (groups) setLocalGroups(groups);
    }
  }

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground mt-1">Drag leads between stages to update their status</p>
        </div>
        <NewLeadDialog>
          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            New Lead
          </Button>
        </NewLeadDialog>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((s) => (
            <Skeleton key={s.id} className="h-64 rounded-xl" style={{ minWidth: 220, width: 220 }} />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map((stage) => {
              const group = localGroups.find((g) => g.stage === stage.id);
              return (
                <DroppableColumn
                  key={stage.id}
                  stage={stage}
                  leads={(group?.leads as Lead[]) ?? []}
                  onLeadClick={(lead) => toast.info(`${lead.firstName} ${lead.lastName ?? ''} — detail view coming soon`)}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeLead && <LeadCard lead={activeLead} onClick={() => {}} />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
