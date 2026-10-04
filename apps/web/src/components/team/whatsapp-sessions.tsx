'use client';

import { hasPermission } from '@dental-crm/shared';
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
  const qc = useQueryClient();
  const mine = useQuery<Session>({
    queryKey: ['whatsapp-session', user?.sub],
    queryFn: () => apiRequest('/api/whatsapp/sessions/me', {}, accessToken ?? undefined),
    enabled: !manager && !!accessToken,
    refetchInterval: (query) => ['connecting', 'awaiting_scan'].includes(query.state.data?.state ?? '') ? 4000 : 15000,
  });
  const team = useQuery<Session[]>({
    queryKey: ['whatsapp-team'],
    queryFn: () => apiRequest('/api/whatsapp/sessions', {}, accessToken ?? undefined),
    enabled: manager && !!accessToken,
    refetchInterval: 15000,
  });
  const action = useMutation({
    mutationFn: (path: string) => apiRequest(path, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-session'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-team'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Session action failed'),
  });
  function unlink(path: string) {
    if (window.confirm('Disconnect this work WhatsApp account from the CRM? Existing messages will remain.')) action.mutate(path);
  }
  const data = mine.data;

  return <div className="space-y-6">
    {!manager && <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" />My work WhatsApp</CardTitle>
        <CardDescription>Link your work number to reply to leads from the CRM. Managers can see its connection status and business conversations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mine.isError ? <QueryError error={mine.error} onRetry={mine.refetch} /> : mine.isLoading ? <p role="status">Checking your session…</p> : data && <>
          <div className="flex items-center gap-3"><Badge variant={data.state === 'connected' ? 'success' : 'secondary'}>{stateLabels[data.state]}</Badge>{data.linkedNumber && <span>+{data.linkedNumber}</span>}</div>
          {!data.enabled && <p className="text-sm text-muted-foreground">Work phone linking is not enabled yet. Ask your administrator to enable it on the CRM service.</p>}
          {data.state === 'awaiting_scan' && data.qrDataUrl && <div className="space-y-3">
            <Image src={data.qrDataUrl} alt="Link your work WhatsApp account" width={280} height={280} unoptimized className="rounded border bg-white p-3" />
            <p className="text-sm">On your work phone: WhatsApp → Linked devices → Link a device, then scan this QR code.</p>
          </div>}
          {data.error && <p className="text-sm text-destructive" role="alert">{data.error}</p>}
          <div className="flex flex-wrap gap-2">
            {data.enabled && data.state !== 'connected' && <Button disabled={action.isPending || data.state === 'connecting' || data.state === 'awaiting_scan'} onClick={() => action.mutate('/api/whatsapp/sessions/me/connect')}>{data.state === 'connecting' ? 'Connecting…' : data.state === 'awaiting_scan' ? 'Scan the QR code' : 'Connect my work number'}</Button>}
            {data.enabled && data.state !== 'disconnected' && <Button variant="outline" disabled={action.isPending} onClick={() => unlink('/api/whatsapp/sessions/me/logout')}>Disconnect</Button>}
            <Button variant="outline" onClick={() => mine.refetch()} disabled={mine.isFetching} aria-label="Refresh connection status"><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="outline" asChild><Link href={`/inbox?session=${encodeURIComponent(data.sessionId)}`}>My conversations</Link></Button>
          </div>
          <p className="text-xs text-muted-foreground">Only messages delivered after linking are captured. Text sent from the work phone or its linked devices is also recorded. This shows conversations, not an employee’s screen or which device typed a message. Use a work account; personal chats on that number will also sync.</p>
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
