'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Mail, MessageCircle, Phone } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { STUCK_LEAD_DAYS } from '@dental-crm/shared';
import { useUpdateLeadTask, type Lead } from '@/hooks/use-leads';
import { useClinicSettings } from '@/hooks/use-reports';
import { formatDealValue } from '@/lib/money';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';
import { LeadTaskBadge } from './lead-task-badge';

const SOURCE_LABELS: Record<string, string> = {
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook',
  INSTAGRAM_ADS: 'Instagram',
  GOOGLE: 'Google',
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  OTHER: 'Other',
};

function initials(firstName?: string, lastName?: string | null) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

/** Whole days since the lead last changed stage. */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * A deal card in the Bitrix24 shape: title as a blue link, the amount directly under it in bold,
 * then the quiet contact lines. The order is the point — on a fourteen-column board the two things
 * anyone scans for are who it is and what it is worth, so nothing sits between them.
 */
export function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const updateTask = useUpdateLeadTask();
  // Tasks arrive soonest-due first, so the first open one is the next thing to do.
  const nextTask = lead.tasks?.[0];
  const idleDays = lead.stageChangedAt ? daysSince(lead.stageChangedAt) : 0;
  const isStuck = idleDays >= STUCK_LEAD_DAYS;
  // Cached clinic-wide, so this fires once no matter how many cards are on screen.
  const { data: clinicSettings } = useClinicSettings();
  const fullName = `${lead.firstName} ${lead.lastName ?? ''}`.trim();
  const whatsappLink = buildWhatsAppLink(
    lead.whatsappNumber || lead.phone,
    fullName,
    clinicSettings?.clinicName ?? 'the clinic',
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        className={cn(
          'group cursor-pointer rounded-[3px] border border-bx-line bg-bx-surface px-2.5 py-2',
          'transition-colors hover:border-bx-link/50 active:cursor-grabbing',
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <div className="flex items-start justify-between gap-1.5">
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight text-bx-link group-hover:underline"
            title={fullName}
          >
            {fullName}
          </span>
          {lead.assignedTo && (
            <Avatar
              className="h-5 w-5 shrink-0"
              title={`${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`}
            >
              <AvatarFallback className="bg-bx-board text-[9px] font-medium text-bx-muted">
                {initials(lead.assignedTo.firstName, lead.assignedTo.lastName)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>

        {lead.estimatedValue != null && (
          <p className="mt-1 text-[13px] font-bold tabular-nums leading-tight text-bx-text">
            {formatDealValue(lead.estimatedValue, lead.currency)}
          </p>
        )}

        <div className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-bx-muted">
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.phone}</span>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  // The card is both a link to the deal and a drag handle, so a click meant for
                  // WhatsApp must not open the sheet or start a drag on its way out.
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  title="Message on WhatsApp"
                  className="shrink-0 rounded-full p-0.5 text-success transition-colors hover:bg-success-muted"
                >
                  <MessageCircle className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.source && (
            <p className="truncate">{SOURCE_LABELS[lead.source] ?? lead.source}</p>
          )}
        </div>

        {nextTask && (
          <LeadTaskBadge
            task={nextTask}
            onComplete={(taskId) => updateTask.mutate({ taskId, leadId: lead.id, completed: true })}
            className="border-bx-line"
          />
        )}

        {isStuck && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-destructive-muted-foreground">
            <Clock className="h-3 w-3" />
            No movement · {idleDays}d
          </p>
        )}
      </div>
    </div>
  );
}
