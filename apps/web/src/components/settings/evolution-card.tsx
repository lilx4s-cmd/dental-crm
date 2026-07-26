'use client';

import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, QrCode, RefreshCw, Server } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

type EvolutionState = 'not_configured' | 'unreachable' | 'close' | 'connecting' | 'open';

interface EvolutionStatus {
  configured: boolean;
  state: EvolutionState;
  qrDataUrl: string | null;
  instance: string;
  error: string | null;
}

export function EvolutionCard() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<EvolutionStatus>({
    queryKey: ['evolution-status'],
    queryFn: () => apiRequest('/api/whatsapp/evolution/status', {}, accessToken ?? undefined),
    // A pairing QR rotates every 20 seconds or so, so an unpaired instance needs polling or
    // somebody scans a code that has already expired.
    refetchInterval: (q) => (q.state.data?.state === 'close' || q.state.data?.state === 'connecting' ? 5000 : false),
  });

  const connect = useMutation({
    mutationFn: () =>
      apiRequest('/api/whatsapp/evolution/connect', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evolution-status'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not reach Evolution'),
  });

  const webhookPath = `/api/whatsapp/evolution/webhook?token=YOUR_EVOLUTION_WEBHOOK_TOKEN`;
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Evolution API gateway
          </CardTitle>
          <CardDescription>
            Your self-hosted WhatsApp gateway. The session lives there rather than in the CRM, so a
            deploy or restart here no longer drops it.
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
        ) : !data?.configured ? (
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="mb-1.5 font-medium">Not connected yet. Add these in Render, then redeploy:</p>
            <ul className="space-y-0.5 font-mono">
              <li>EVOLUTION_API_URL</li>
              <li>EVOLUTION_API_KEY</li>
              <li>EVOLUTION_INSTANCE</li>
              <li>EVOLUTION_WEBHOOK_TOKEN</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Your Evolution server needs a public URL this CRM can reach — a copy running only on
              your own machine will not work.
            </p>
          </div>
        ) : data.state === 'open' ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            Connected — instance <code className="rounded bg-muted px-1">{data.instance}</code>
          </p>
        ) : data.state === 'unreachable' ? (
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-muted-foreground" />
            Cannot reach the gateway. Check <span className="font-mono text-xs">EVOLUTION_API_URL</span> is
            publicly reachable and the key is the global one.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning-muted-foreground" />
              Instance <code className="rounded bg-muted px-1">{data.instance}</code> is not paired.
            </p>

            {data.qrDataUrl ? (
              <>
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
              </>
            ) : (
              <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
                <QrCode className="mr-2 h-4 w-4" />
                {connect.isPending ? 'Asking…' : 'Show QR code'}
              </Button>
            )}
          </div>
        )}

        <div className="rounded-md border bg-muted/40 p-3 text-xs">
          <p className="mb-1 font-medium">Webhook to set in Evolution</p>
          <code className="break-all">{apiBase + webhookPath}</code>
          <p className="mt-1.5 text-muted-foreground">
            Subscribe it to <span className="font-mono">MESSAGES_UPSERT</span>. Evolution does not
            sign its payloads, so the token on the URL is what proves a delivery is genuine — use
            the same value as <span className="font-mono">EVOLUTION_WEBHOOK_TOKEN</span>.
          </p>
        </div>

        {data?.error && (
          <p className="rounded-md border border-destructive/25 bg-destructive-muted px-3 py-2 text-xs text-destructive-muted-foreground">
            {data.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
