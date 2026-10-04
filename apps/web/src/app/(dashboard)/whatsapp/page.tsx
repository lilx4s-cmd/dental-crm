'use client';
import { WhatsAppSessions } from '@/components/team/whatsapp-sessions';
export default function WhatsAppPage() {
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">Work WhatsApp</h1><p className="mt-1 text-muted-foreground">Connect work numbers and keep sales conversations visible in the CRM.</p></div><WhatsAppSessions /></div>;
}
