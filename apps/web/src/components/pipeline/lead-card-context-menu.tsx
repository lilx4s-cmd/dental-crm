'use client';

import {
  Archive,
  ArrowRightLeft,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  Tag as TagIcon,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { PIPELINE_STAGES } from '@dental-crm/shared';
import { useBulkArchiveLeads, type Lead } from '@/hooks/use-leads';
import { useClinicSettings } from '@/hooks/use-reports';
import { buildWhatsAppLink } from '@/lib/whatsapp';

/**
 * Right-click on a deal.
 *
 * The point of this menu is the things that currently cost a round trip through the detail sheet:
 * copying a number to dial from a desk phone, moving a stage without dragging across fourteen
 * columns, opening WhatsApp. Each is two clicks today and one here.
 *
 * Actions that need a form — a note, a task, a lost reason — are not here. A context menu item
 * that opens a dialog is fine; one that pretends to complete a job it cannot is not, and "add a
 * reminder" without a date field would be the latter.
 *
 * Right-clicking a card that is part of a selection acts on the whole selection where the action
 * supports it; the labels say which, because "Archive" meaning one deal or forty is exactly the
 * ambiguity that makes people distrust a menu.
 */
export function LeadCardContextMenu({
  lead,
  selectedLeads,
  children,
  onOpen,
  onMoveToStage,
  onChangeResponsible,
  onTag,
}: {
  lead: Lead;
  /** The board's current selection. Used only when this card is part of it. */
  selectedLeads: Lead[];
  children: React.ReactNode;
  onOpen: () => void;
  onMoveToStage: (leads: Lead[], stage: string) => void;
  onChangeResponsible: (leads: Lead[]) => void;
  onTag: (leads: Lead[]) => void;
}) {
  const { data: clinicSettings } = useClinicSettings();
  const archive = useBulkArchiveLeads();

  // A right-click inside a selection acts on the selection. A right-click outside one acts on the
  // card under the cursor — matching every file manager, and the behaviour people already expect.
  const inSelection = selectedLeads.some((l) => l.id === lead.id);
  const targets = inSelection && selectedLeads.length > 1 ? selectedLeads : [lead];
  const many = targets.length > 1;
  const suffix = many ? ` (${targets.length})` : '';

  const fullName = `${lead.firstName} ${lead.lastName ?? ''}`.trim();
  const number = lead.whatsappNumber || lead.phone;
  const whatsappLink = buildWhatsAppLink(
    number,
    fullName,
    clinicSettings?.clinicName ?? 'the clinic',
    lead.country,
  );

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      // Clipboard access is refused outside a secure context and in some embedded browsers. Saying
      // so beats a menu item that silently does nothing.
      toast.error('Your browser would not let the page copy that.');
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="truncate">
          {many ? `${targets.length} deals selected` : fullName}
        </ContextMenuLabel>
        <ContextMenuSeparator />

        {!many && (
          <ContextMenuItem onSelect={onOpen}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open deal
          </ContextMenuItem>
        )}

        {/* Contact actions are single-deal only: there is no sensible meaning to "call forty". */}
        {!many && lead.phone && (
          <ContextMenuItem onSelect={() => copy(lead.phone!, 'Phone number')}>
            <Copy className="mr-2 h-4 w-4" />
            Copy phone number
          </ContextMenuItem>
        )}
        {!many && lead.phone && (
          <ContextMenuItem asChild>
            {/* tel: rather than a copy, for the deskphone and softphone setups that register it. */}
            <a href={`tel:${lead.phone}`}>
              <Phone className="mr-2 h-4 w-4" />
              Call {lead.phone}
            </a>
          </ContextMenuItem>
        )}
        {!many && whatsappLink && (
          <ContextMenuItem asChild>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Message on WhatsApp
            </a>
          </ContextMenuItem>
        )}
        {!many && lead.email && (
          <ContextMenuItem onSelect={() => copy(lead.email!, 'Email address')}>
            <Copy className="mr-2 h-4 w-4" />
            Copy email
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Move to stage{suffix}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-80 overflow-y-auto">
            {PIPELINE_STAGES.map((stage) => (
              <ContextMenuItem
                key={stage.id}
                onSelect={() => onMoveToStage(targets, stage.id)}
                // Lost needs a reason per deal and this menu collects none. The drag path still
                // asks properly, one at a time.
                disabled={stage.id === lead.stage || stage.terminal === 'lost'}
              >
                <span
                  className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                {stage.label}
                {stage.terminal === 'lost' && (
                  <span className="ml-2 text-xs text-muted-foreground">needs a reason</span>
                )}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem onSelect={() => onChangeResponsible(targets)}>
          <UserCheck className="mr-2 h-4 w-4" />
          Change responsible{suffix}
        </ContextMenuItem>

        <ContextMenuItem onSelect={() => onTag(targets)}>
          <TagIcon className="mr-2 h-4 w-4" />
          Tags{suffix}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onSelect={() =>
            archive.mutate(
              { leadIds: targets.map((l) => l.id) },
              {
                onSuccess: (r) =>
                  r.changed === 0
                    ? toast.info('Already archived.')
                    : toast.success(`${r.changed} archived`, {
                        action: {
                          label: 'Undo',
                          onClick: () =>
                            archive.mutate({ leadIds: targets.map((l) => l.id), archived: false }),
                        },
                      }),
                onError: (e) => toast.error(e.message || 'Could not archive'),
              },
            )
          }
        >
          <Archive className="mr-2 h-4 w-4" />
          Archive{suffix}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
