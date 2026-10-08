'use client';
import Link from 'next/link';
import { hasPermission, whatsappContactPhone } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import type { ConversationSummary } from '@/hooks/use-conversations';
import { Button } from '@/components/ui/button';
import { NewLeadDialog } from './new-lead-dialog';

export function ConversationDealAction({ conversation }: { conversation: ConversationSummary }) {
  const { user } = useAuth();
  if (!hasPermission(user, 'leads.read', true)) return null;
  if (conversation.lead) return <Button asChild variant="outline" size="sm"><Link href={`/pipeline?leadId=${encodeURIComponent(conversation.lead.id)}`}>Open deal</Link></Button>;
  if (conversation.channel !== 'WHATSAPP' || !hasPermission(user, 'leads.write', true)) return null;
  const phone = whatsappContactPhone(conversation.externalThreadId);
  if (!phone) return <Button variant="outline" size="sm" disabled title="Wait for a verified contact phone number. Group and private identifiers cannot be used.">Phone not available</Button>;
  const contactName = conversation.whatsappContactName?.trim() ?? '';
  const name = /[\p{L}]/u.test(contactName) ? contactName.split(/\s+/) : [];
  const owner = conversation.assignedTo?.id ?? (conversation.whatsappSessionId.startsWith('user:') ? conversation.whatsappSessionId.slice(5) : user?.sub);
  if (owner !== user?.sub && !hasPermission(user, 'leads.assign', user?.role === 'SUPER_ADMIN')) return <Button size="sm" variant="outline" disabled title="Ask the responsible salesperson to create this deal.">Add deal</Button>;
  return <NewLeadDialog conversationId={conversation.id} prefill={{
    firstName: conversation.patient?.firstName ?? name[0] ?? '',
    lastName: conversation.patient?.lastName ?? name.slice(1).join(' '),
    phone, whatsappNumber: phone, source: 'WHATSAPP', assignedToId: owner,
  }}><Button variant="outline" size="sm" className="min-h-11">Add deal</Button></NewLeadDialog>;
}
