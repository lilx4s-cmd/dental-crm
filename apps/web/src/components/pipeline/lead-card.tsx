'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, History, Mail, MessageCircle, Phone } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { STAGE_LABELS, STUCK_LEAD_DAYS, languageName } from '@dental-crm/shared';
import { useUpdateLeadTask, type Lead } from '@/hooks/use-leads';
import { useClinicSettings } from '@/hooks/use-reports';
import { formatDealValue } from '@/lib/money';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';
import { LeadTaskBadge } from './lead-task-badge';
import { TagPill } from '@/components/tags/tag-pill';
import { countryFlag, daysSince, initials, shortAgo, sourceLabel } from '@/lib/format';

/**
 * A deal card in the Bitrix24 shape: title as a blue link, the amount directly under it in bold,
 * then the quiet contact lines. The order is the point — on a fourteen-column board the two things
 * anyone scans for are who it is and what it is worth, so nothing sits between them.
 */
export function LeadCard({
  lead,
  onClick,
}: {
  lead: Lead;
  /**
   * Receives the event so the caller can read Ctrl/Cmd and Shift. The board uses those to select
   * rather than open, and the modifier state is only available here.
   */
  onClick: (event: React.MouseEvent) => void;
}) {
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
    lead.country,
  );

  /**
   * The most recent thing that happened, from either side.
   *
   * The patient's last message and the last thing staff recorded are two different clocks, and the
   * card has room for one line. Whichever is newer is the one that answers "where is this deal" —
   * a reply that arrived after our note changes the picture, and a note written after their reply
   * means somebody has already dealt with it.
   */
  const lastEvent = (() => {
    const activity = lead.activities?.[0];
    const message = lead.conversations?.[0]?.messages?.[0];

    const activityAt = activity ? new Date(activity.createdAt).getTime() : -1;
    const messageAt = message ? new Date(message.createdAt).getTime() : -1;
    if (activityAt < 0 && messageAt < 0) return null;

    if (messageAt >= activityAt && message) {
      const inbound = message.direction === 'INBOUND';
      const body = message.content?.replace(/\s+/g, ' ').trim();
      return {
        icon: (
          <MessageCircle
            className={cn('h-3 w-3 shrink-0', inbound ? 'text-success' : 'text-bx-muted')}
          />
        ),
        // Prefixed rather than colour-coded alone: on a dense board the direction is the whole
        // meaning, and colour is the first thing lost to a projector or a colour-blind reader.
        text: `${inbound ? '' : 'You: '}${body || (inbound ? 'Sent an attachment' : 'Sent a message')}`,
        title: body ?? undefined,
        ago: shortAgo(message.createdAt),
      };
    }

    const note = activity!.note?.replace(/\s+/g, ' ').trim();
    return {
      icon: <History className="h-3 w-3 shrink-0" />,
      text: note || (activity!.toStage ? `Moved to ${STAGE_LABELS[activity!.toStage] ?? activity!.toStage}` : 'Updated'),
      title: note ?? undefined,
      ago: shortAgo(activity!.createdAt),
    };
  })();

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
          onClick(e);
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
          {/* The WhatsApp shortcut used to live inline here. It moved to the action row at the
              bottom of the card, so the three contact actions sit together instead of one being
              attached to the phone line and the rest appearing below it on hover. */}
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {/* Country and source share a line. Both are a word each, and giving them a line apiece
              pushes the task badge below the fold on a laptop, which is where the card stops being
              scannable. Country first: for a medical-tourism coordinator it decides the language,
              the hour to call, and the price list. */}
          {(lead.country || lead.preferredLanguage || lead.source) && (
            <p className="flex items-center gap-1.5 truncate">
              {lead.country && (
                <span className="shrink-0 font-medium" title={lead.country}>
                  {countryFlag(lead.country)} {lead.country}
                </span>
              )}
              {/* Language before source. Which language somebody speaks decides who can pick the
                  deal up at all; where they came from is background. Shown only when it is not the
                  clinic's own working language, so the badge means "this one needs somebody
                  specific" rather than appearing on every card. */}
              {lead.preferredLanguage && lead.preferredLanguage !== 'tr' && (
                <>
                  {lead.country && <span className="text-bx-line">·</span>}
                  <span
                    className="shrink-0 rounded bg-bx-board px-1 font-medium uppercase"
                    title={`Speaks ${languageName(lead.preferredLanguage)}`}
                  >
                    {lead.preferredLanguage}
                  </span>
                </>
              )}
              {(lead.country || lead.preferredLanguage) && lead.source && <span className="text-bx-line">·</span>}
              {lead.source && <span className="truncate">{sourceLabel(lead.source)}</span>}
            </p>
          )}
        </div>

        {/* Tags below the contact lines: they are the slowest-changing thing on the card, so they
            are what the eye can skip once it knows the deal. Capped at three — a card is around
            260px wide and a fourth pill wraps the row, moving everything under it. */}
        {lead.tags && lead.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {lead.tags.slice(0, 3).map(({ tag }) => (
              <TagPill key={tag.id} name={tag.name} color={tag.color} size="xs" />
            ))}
            {lead.tags.length > 3 && (
              <span
                className="text-[10px] text-bx-muted"
                title={lead.tags.slice(3).map(({ tag }) => tag.name).join(', ')}
              >
                +{lead.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {nextTask && (
          <LeadTaskBadge
            task={nextTask}
            onComplete={(taskId) => updateTask.mutate({ taskId, leadId: lead.id, completed: true })}
            className="border-bx-line"
          />
        )}

        {/* The last thing that happened, whichever side it came from.
            One line, not two: a card showing both its own history and the patient's reply is a
            card nobody reads. Whichever is newer is the one that answers "where is this deal". */}
        {lastEvent && (
          <p
            className="mt-1.5 flex items-center gap-1 truncate text-[10px] leading-snug text-bx-muted"
            title={lastEvent.title}
          >
            {lastEvent.icon}
            <span className="truncate">{lastEvent.text}</span>
            <span className="shrink-0 tabular-nums opacity-70">· {lastEvent.ago}</span>
          </p>
        )}

        {isStuck && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-destructive-muted-foreground">
            <Clock className="h-3 w-3" />
            No movement · {idleDays}d
          </p>
        )}

        {/* Hover actions. Hidden until the pointer is on the card, and revealed on focus-within so
            they are reachable by keyboard — `group-hover` alone makes a control that exists only
            for people using a mouse.
            Kept to the three that are genuinely one-click: everything else needs a form, and lives
            in the right-click menu or the deal sheet where there is room to ask. */}
        <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title={`Call ${lead.phone}`}
              aria-label={`Call ${fullName}`}
              className="rounded p-1 text-bx-muted transition-colors hover:bg-bx-board hover:text-bx-text"
            >
              <Phone className="h-3 w-3" />
            </a>
          )}
          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title="Message on WhatsApp"
              aria-label={`Message ${fullName} on WhatsApp`}
              className="rounded p-1 text-success transition-colors hover:bg-success-muted"
            >
              <MessageCircle className="h-3 w-3" />
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title={`Email ${lead.email}`}
              aria-label={`Email ${fullName}`}
              className="rounded p-1 text-bx-muted transition-colors hover:bg-bx-board hover:text-bx-text"
            >
              <Mail className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
