'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, Mail, DollarSign, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Lead } from '@/hooks/use-leads';
import { useClinicSettings } from '@/hooks/use-reports';
import { buildWhatsAppLink } from '@/lib/whatsapp';

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

export function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  // Cached clinic-wide, so this fires once no matter how many cards are on screen.
  const { data: clinicSettings } = useClinicSettings();
  const whatsappLink = buildWhatsAppLink(
    lead.whatsappNumber || lead.phone,
    `${lead.firstName} ${lead.lastName ?? ''}`.trim(),
    clinicSettings?.clinicName ?? 'the clinic',
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {lead.firstName} {lead.lastName ?? ''}
            </p>
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Message on WhatsApp"
                className="shrink-0 rounded-full p-0.5 text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-950/50 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {lead.assignedTo && (
            <Avatar className="h-5 w-5 shrink-0" title={`${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`}>
              <AvatarFallback className="text-[9px]">
                {initials(lead.assignedTo.firstName, lead.assignedTo.lastName)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        {lead.source && (
          <Badge variant="outline" className="mt-1 text-xs">
            {SOURCE_LABELS[lead.source] ?? lead.source}
          </Badge>
        )}
        <div className="mt-2 space-y-1">
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span className="truncate">{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.estimatedValue != null && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
              <DollarSign className="h-3 w-3" />
              <span>{lead.estimatedValue.toLocaleString()} {lead.currency}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
