'use client';

import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, LogOut, QrCode, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

type WebState = 'disabled' | 'disconnected' | 'connecting' | 'awaiting_scan' | 'connected';

interface WebStatus {
  enabled: boolean;
  state: WebState;
  qrDataUrl: string | null;
  linkedNumber: string | null;
  error: string | null;
}

export function WhatsAppQrCard() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<WebStatus>({
    queryKey: ['whatsapp-web-status'],
    queryFn: () => apiRequest('/api/whatsapp/web/status', {}, accessToken ?? undefined),
    // A pairing QR rotates every 20 seconds or so, so while one is on screen the card has to keep
    // up or the user scans a code that has already expired.
    refetchInterval: (query) =>
      query.state.data?.state === 'awaiting_scan' || query.state.data?.state === 'connecting' ? 3000 : false,
  });

  const connect = useMutation({
    mutationFn: () => apiRequest('/api/whatsapp/web/connect', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-web-status'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not start the session'),
  });

  const logout = useMutation({
    mutationFn: () => apiRequest('/api/whatsapp/web/logout', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-web-status'] });
      toast.success('Device unlinked');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-4 w-4" />
          Link by QR code
        </CardTitle>
        <CardDescription>
          Connects the number you already use, the way WhatsApp Web does. Messages arrive in the
          CRM without waiting for Meta approval.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stated on the screen where somebody is about to do it, not buried in documentation.
            The risk falls on the clinic's main lead channel. */}
        <div className="rounded-md border border-warning/30 bg-warning-muted px-3 py-2 text-xs text-warning-muted-foreground">
          <p className="font-medium">This uses an unofficial connection.</p>
          <p className="mt-1">
            Meta does not permit it and can ban the number, which would cost you the conversations
            and the channel most of your enquiries arrive through. It is meant as a stopgap while
            Cloud API verification is in progress, not a permanent setup.
          </p>
        </div>

        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </p>
        ) : !data?.enabled ? (
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="mb-1.5 font-medium">Switched off. To enable it, add this in Render and redeploy:</p>
            <p className="font-mono">WHATSAPP_WEB_ENABLED=true</p>
            <p className="mt-1.5 text-muted-foreground">
              It also needs an always-on instance — a free Render service sleeps when idle, which
              drops the session every time.
            </p>
          </div>
        ) : data.state === 'connected' ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              Linked{data.linkedNumber ? ` as +${data.linkedNumber}` : ''}
            </p>
            <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut className="mr-2 h-4 w-4" />
              Unlink this device
            </Button>
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
              <li>Scan this code</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              The code refreshes every few seconds. Scan whichever one is on screen.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              {data.state === 'connecting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
                </>
              ) : (
                <>
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" /> Not linked
                </>
              )}
            </p>
            <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending || data.state === 'connecting'}>
              <QrCode className="mr-2 h-4 w-4" />
              {connect.isPending ? 'Starting…' : 'Show QR code'}
            </Button>
          </div>
        )}

        {data?.error && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive-muted px-3 py-2 text-xs text-destructive-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {data.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
