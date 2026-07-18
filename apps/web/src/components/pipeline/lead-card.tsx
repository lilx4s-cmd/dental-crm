'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, Mail, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Lead } from '@/hooks/use-leads';

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

export function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });

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
        <p className="font-medium text-sm truncate">
          {lead.firstName} {lead.lastName ?? ''}
        </p>
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
