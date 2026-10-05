'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, LogOut, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { WhatsAppLogoutDialog } from '@/components/whatsapp/logout-dialog';

type WebConnectionState = 'disabled' | 'disconnected' | 'connecting' | 'awaiting_scan' | 'connected';

interface WhatsAppWebStatus {
  enabled: boolean;
  state: WebConnectionState;
  /** Present only while a code is waiting to be scanned. */
  qrDataUrl: string | null;
  linkedNumber: string | null;
  error: string | null;
  syncingContacts?: boolean;
  contactSyncError?: string | null;
}

/** Bare digits are what the socket reports; show them the way a person writes a number. */
function prettyNumber(digits: string): string {
  return `+${digits}`;
}

/**
 * Links the clinic's own WhatsApp number by QR, the way WhatsApp Web does.
 *
 * The API for this has existed since the QR transport was added — status, connect and logout — but
 * nothing ever called it, so the session could not be started, inspected or ended from the product.
 * This is that missing half.
 */
export function WhatsAppWebCard() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<WhatsAppWebStatus>({
    queryKey: ['whatsapp-web-status'],
    queryFn: () => apiRequest('/api/whatsapp/web/status', {}, accessToken ?? undefined),
    // A pairing QR expires after about twenty seconds, so while one is on screen the card has to
    // keep asking for the current code — otherwise staff scan an image that has already lapsed and
    // it reads as the link being broken.
    refetchInterval: (q) => {
      const s = q.state.data?.state;
      return q.state.data?.syncingContacts || s === 'awaiting_scan' || s === 'connecting' ? 4000 : false;
    },
  });

  const connect = useMutation({
    mutationFn: () => apiRequest('/api/whatsapp/web/connect', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-web-status'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not start the session'),
  });

  const newQr = useMutation({
    mutationFn: () => apiRequest<WhatsAppWebStatus>('/api/whatsapp/web/new-qr', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: (result) => {
      qc.setQueryData(['whatsapp-web-status'], result);
      qc.invalidateQueries({ queryKey: ['whatsapp-web-status'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not prepare a new QR code'),
  });

  const logout = useMutation({
    mutationFn: () => apiRequest<WhatsAppWebStatus>('/api/whatsapp/web/logout', { method: 'POST' }, accessToken ?? undefined),
    onMutate: () => qc.cancelQueries({ queryKey: ['whatsapp-web-status'] }),
    onSuccess: (result) => {
      if (result.error) toast.warning(result.error);
      else toast.success('WhatsApp connection reset. You can request a new QR code.');
      qc.setQueryData(['whatsapp-web-status'], result);
      qc.invalidateQueries({ queryKey: ['whatsapp-web-status'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not unlink'),
  });

  const syncContacts = useMutation({
    mutationFn: () => apiRequest('/api/whatsapp/web/sync-contacts', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => { toast.success('Contact name sync started. Keep WhatsApp online on your phone.'); qc.invalidateQueries({ queryKey: ['conversations'] }); qc.invalidateQueries({ queryKey: ['whatsapp-web-status'] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not sync contact names'),
  });

  return (
    <Card>
      <WhatsAppLogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} onConfirm={() => logout.mutate()} />
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Linked phone session
          </CardTitle>
          <CardDescription>
            Links the clinic&apos;s existing WhatsApp number by QR, like WhatsApp Web. Messages land in
            the same inbox as every other transport.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </p>
        ) : !data?.enabled ? (
          // Two different reasons land here, and they need different actions, so the card says
          // which one applies rather than a single "unavailable".
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="mb-1.5 font-medium">Switched off.</p>
            <p className="text-muted-foreground">
              Set <span className="font-mono">WHATSAPP_WEB_ENABLED=true</span> on the API service in
              Render and redeploy. It also stays off whenever the Evolution gateway above is
              configured — two clients on one number would ingest every incoming message twice, so
              only one of them may run.
            </p>
          </div>
        ) : data.state === 'connected' ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              Linked{data.linkedNumber ? ' as ' : ''}
              {data.linkedNumber && (
                <code className="rounded bg-muted px-1">{prettyNumber(data.linkedNumber)}</code>
              )}
            </p>
          </div>
        ) : data.state === 'awaiting_scan' && data.qrDataUrl ? (
          <div className="space-y-3">
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <Image src={data.qrDataUrl} alt="WhatsApp pairing QR code" width={280} height={280} unoptimized />
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Open WhatsApp on the clinic phone</li>
              <li>
                Tap <strong>Settings → Linked devices → Link a device</strong>
              </li>
              <li>Scan this code — it refreshes every few seconds</li>
            </ol>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning-muted-foreground" />
              {data.state === 'connecting' ? 'Connecting — the code is on its way…' : 'Not linked.'}
            </p>
            <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending || data.state === 'connecting'}>
              <QrCode className="mr-2 h-4 w-4" />
              {connect.isPending ? 'Starting…' : 'Show QR code'}
            </Button>
          </div>
        )}

        {data?.enabled && <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={newQr.isPending || logout.isPending || connect.isPending || syncContacts.isPending} onClick={() => newQr.mutate()}><QrCode className="mr-2 h-4 w-4" />{newQr.isPending ? 'Preparing…' : 'Get a new QR code'}</Button>
            {data.state === 'connected' && <Button variant="outline" size="sm" disabled={data.syncingContacts || syncContacts.isPending || newQr.isPending || logout.isPending || connect.isPending} onClick={() => syncContacts.mutate()}>{data.syncingContacts || syncContacts.isPending ? 'Syncing names…' : 'Sync contact names'}</Button>}
            <Button variant="outline" size="sm" disabled={logout.isPending || newQr.isPending || connect.isPending || syncContacts.isPending} onClick={() => setLogoutOpen(true)}><LogOut className="mr-2 h-4 w-4" />{logout.isPending ? 'Signing out…' : 'Sign out & reset'}</Button>
          </div>
          <p className="text-xs text-muted-foreground">If the QR code does not appear, sign out and reset, then request a new code. For missing saved names, connect the phone and choose Sync contact names. Saved conversations remain.</p>
          {data.syncingContacts && <p role="status" className="text-sm">Syncing saved contact names… You can keep using the CRM.</p>}
          {data.contactSyncError && <p role="alert" className="text-sm text-destructive">{data.contactSyncError}</p>}
        </div>}

        {/* Stated on the card rather than buried in a runbook: it is the clinic's number at stake. */}
        {data?.enabled && (
          <p className="text-xs text-muted-foreground">
            This drives WhatsApp through an unofficial client, which Meta&apos;s terms prohibit and
            which can get the number banned. It is a stopgap until Cloud API verification completes.
          </p>
        )}

        {data?.error && (
          <p className="rounded-md border border-destructive/25 bg-destructive-muted px-3 py-2 text-xs text-destructive-muted-foreground">
            {data.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
