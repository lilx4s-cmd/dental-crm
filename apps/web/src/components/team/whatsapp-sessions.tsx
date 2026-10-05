'use client';

import { hasPermission } from '@dental-crm/shared';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QueryError } from '@/components/ui/query-state';

type Session = {
  sessionId: string;
  assignedLeads?: number;
  contactedLeads?: number;
  uncontactedLeads?: number;
  enabled: boolean;
  needsSetup?: boolean;
  storedConversations?: number;
  storedMessages?: number;
  historyReceived?: boolean;
  messageEventsSeen?: number;
  captureError?: string | null;
  syncingContacts?: boolean;
  contactSyncError?: string | null;
  state: 'disabled' | 'disconnected' | 'connecting' | 'awaiting_scan' | 'connected';
  linkedNumber: string | null;
  qrDataUrl?: string | null;
  error: string | null;
  lastMessageAt?: string | null;
  connectedAt?: string | null;
  user?: { id: string; firstName: string; lastName: string; role: string };
};

const stateLabels = { disabled: 'Not enabled', disconnected: 'Disconnected', connecting: 'Connecting', awaiting_scan: 'Waiting for scan', connected: 'Connected' };

export function WhatsAppSessions() {
  const { user, accessToken } = useAuth();
  const manager = hasPermission(user, 'conversations.supervise', user?.role === 'SUPER_ADMIN' || user?.role === 'CLINIC_MANAGER');
  const canPair = !manager || user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();
  const mine = useQuery<Session>({
    queryKey: ['whatsapp-session', user?.sub],
    queryFn: () => apiRequest('/api/whatsapp/sessions/me', {}, accessToken ?? undefined),
    enabled: canPair && !!accessToken,
    refetchInterval: (query) => query.state.data?.syncingContacts || ['connecting', 'awaiting_scan'].includes(query.state.data?.state ?? '') ? 4000 : 15000,
  });
  const team = useQuery<Session[]>({
    queryKey: ['whatsapp-team'],
    queryFn: () => apiRequest('/api/whatsapp/sessions', {}, accessToken ?? undefined),
    enabled: manager && !!accessToken,
    refetchInterval: 15000,
  });
  const action = useMutation({
    mutationFn: (path: string) => apiRequest(path, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: (result, path) => {
      if (path.startsWith('/api/whatsapp/sessions/me/') && result) qc.setQueryData(['whatsapp-session', user?.sub], result);
      qc.invalidateQueries({ queryKey: ['whatsapp-session'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-team'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      if (path.endsWith('/sync-contacts')) toast.success('Contact name sync started. Keep WhatsApp online on your phone.');
      if (path === '/api/whatsapp/sessions/me/logout') toast.success('WhatsApp signed out and reset. You can now get a new QR code.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Session action failed'),
  });
  function unlink(path: string) {
    if (window.confirm('Sign out of this work WhatsApp and reset its saved connection? You will need to scan a new QR code. Saved conversations and patient records will remain.')) action.mutate(path);
  }
  const data = mine.data;
  const preparedFor = useRef<string | null>(null);
  const prepare = action.mutate;
  useEffect(() => {
    if (!canPair || !user?.sub || !data?.enabled || !data.needsSetup || data.state !== 'disconnected' || data.error || preparedFor.current === user.sub) return;
    preparedFor.current = user.sub;
    prepare('/api/whatsapp/sessions/me/connect');
  }, [canPair, user?.sub, data?.enabled, data?.needsSetup, data?.state, data?.error, prepare]);

  return <div className="space-y-6">
    {canPair && <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" />{manager ? 'Clinic work WhatsApp' : 'My work WhatsApp'}</CardTitle>
        <CardDescription>{manager ? 'Link a clinic work number to capture its conversations. Your owner panel remains read-only for messages.' : 'Link your work number to reply to leads from the CRM. Managers can see its connection status and business conversations.'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mine.isError ? <QueryError error={mine.error} onRetry={mine.refetch} /> : mine.isLoading ? <p role="status">Checking your session…</p> : data && <>
          <div className="flex items-center gap-3"><Badge variant={data.state === 'connected' ? 'success' : 'secondary'}>{stateLabels[data.state]}</Badge>{data.linkedNumber && <span>+{data.linkedNumber}</span>}</div>
          <div className="rounded-lg border p-3 text-sm"><strong>Saved chats: {data.storedConversations ?? 0}</strong> · Messages: {data.storedMessages ?? 0}<p className="mt-1 text-xs text-muted-foreground">{data.historyReceived ? 'WhatsApp chat history received.' : data.state === 'connected' ? 'Phone linked. Waiting for WhatsApp to provide chat history or new messages.' : 'Chat capture starts after the phone is linked.'}{typeof data.messageEventsSeen === 'number' && ` ${data.messageEventsSeen} message events received since this connection started.`}</p></div>
          {data.captureError && <p className="text-sm text-destructive" role="alert">{data.captureError}</p>}
          {data.contactSyncError && <p className="text-sm text-destructive" role="alert">{data.contactSyncError}</p>}
          {data.syncingContacts && <p role="status" className="text-sm">Syncing saved contact names… You can keep using the CRM.</p>}
          {!data.enabled && <p className="text-sm text-muted-foreground">Your administrator has disabled work WhatsApp linking.</p>}
          {data.state === 'connecting' && <p role="status" className="text-sm">Connecting to WhatsApp… A QR code will appear if pairing is needed. Keep this page open.</p>}
          {data.state === 'awaiting_scan' && data.qrDataUrl && <div className="space-y-3">
            <Image src={data.qrDataUrl} alt="Link your work WhatsApp account" width={280} height={280} unoptimized className="rounded border bg-white p-3" />
            <p className="text-sm">On your work phone: WhatsApp → Linked devices → Link a device, then scan this QR code.</p>
          </div>}
          {data.error && <p className="text-sm text-destructive" role="alert">{data.error}</p>}
          <div className="flex flex-wrap gap-2">
            {data.enabled && <Button disabled={action.isPending} onClick={() => action.mutate('/api/whatsapp/sessions/me/new-qr')}>{action.isPending ? 'Preparing…' : 'Get a new QR code'}</Button>}
            {data.enabled && data.state === 'disconnected' && <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate('/api/whatsapp/sessions/me/connect')}>Resume saved connection</Button>}
            {data.enabled && data.state === 'connected' && <Button variant="outline" disabled={action.isPending || data.syncingContacts} onClick={() => action.mutate('/api/whatsapp/sessions/me/sync-contacts')}>{data.syncingContacts || action.isPending && action.variables?.endsWith('/sync-contacts') ? 'Syncing names…' : 'Sync contact names'}</Button>}
            {data.enabled && <Button variant="outline" disabled={action.isPending} onClick={() => unlink('/api/whatsapp/sessions/me/logout')}>{action.isPending && action.variables?.endsWith('/logout') ? 'Signing out…' : 'Sign out & reset'}</Button>}
            <Button variant="outline" onClick={() => mine.refetch()} disabled={mine.isFetching} aria-label="Refresh connection status"><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="outline" asChild><Link href={`/inbox?session=${encodeURIComponent(data.sessionId)}`}>My conversations</Link></Button>
          </div>
          <p className="text-xs text-muted-foreground">If a new QR code does not appear, choose Sign out &amp; reset, then Get a new QR code. To recover missing saved names while connected, choose Sync contact names and keep WhatsApp online on your phone. Saved conversations remain after a reset. Use a work account; chats on that number sync to the CRM.</p>
        </>}
      </CardContent>
    </Card>}
    {manager && <Card>
      <CardHeader><CardTitle>Team WhatsApp connections</CardTitle><CardDescription>See which work accounts are connected and open their conversations. Contact counts use successful outgoing messages captured on each work account for its currently assigned leads. Disconnected periods may leave gaps.</CardDescription></CardHeader>
      <CardContent>
        {team.isError ? <QueryError error={team.error} onRetry={team.refetch} /> : team.isLoading ? <p role="status">Loading team connections…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Team member</th><th className="p-3">Work number</th><th className="p-3">Connection</th><th className="p-3">Assigned / contacted / no contact recorded</th><th className="p-3">Last message captured</th><th className="p-3">Actions</th></tr></thead><tbody>
          {team.data?.map((session) => <tr key={session.sessionId} className="border-b"><td className="p-3 font-medium">{session.user?.firstName} {session.user?.lastName}</td><td className="p-3">{session.linkedNumber ? `+${session.linkedNumber}` : 'Not linked'}</td><td className="p-3"><Badge variant={session.state === 'connected' ? 'success' : 'secondary'}>{stateLabels[session.state]}</Badge>{session.error && <p className="mt-1 text-xs text-destructive">{session.error}</p>}</td><td className="p-3">{session.assignedLeads} / {session.contactedLeads} / <strong>{session.uncontactedLeads}</strong></td><td className="p-3">{session.lastMessageAt ? new Date(session.lastMessageAt).toLocaleString() : 'No messages captured yet'}</td><td className="p-3"><div className="flex gap-2"><Button size="sm" variant="outline" asChild><Link href={`/inbox?session=${encodeURIComponent(session.sessionId)}`}>View conversations</Link></Button>{session.state !== 'disconnected' && session.state !== 'disabled' && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => unlink(`/api/whatsapp/sessions/${session.user?.id}/logout`)}>Disconnect</Button>}</div></td></tr>)}
        </tbody></table></div>}
      </CardContent>
    </Card>}
  </div>;
}
