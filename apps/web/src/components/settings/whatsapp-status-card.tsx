'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

interface WhatsAppStatus {
  configured: boolean;
  missing: string[];
  /** Sending and receiving fail independently, so they are reported separately. */
  canSend: boolean;
  canReceive: boolean;
}

const WEBHOOK_PATH = '/api/whatsapp/webhook';

export function WhatsAppStatusCard() {
  const { accessToken } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery<WhatsAppStatus>({
    queryKey: ['whatsapp-status'],
    queryFn: () => apiRequest('/api/whatsapp/status', {}, accessToken ?? undefined),
  });

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </CardTitle>
          <CardDescription>
            Brings patient conversations into the CRM instead of individual staff phones. The
            WhatsApp buttons around the app work without this — they just open your own WhatsApp.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </p>
        ) : (
          <>
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2">
                {data?.canReceive ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning-muted-foreground" />
                )}
                Receiving messages{data?.canReceive ? '' : ' — not set up'}
              </p>
              <p className="flex items-center gap-2">
                {data?.canSend ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning-muted-foreground" />
                )}
                Sending messages{data?.canSend ? '' : ' — not set up'}
              </p>
            </div>

            {data && data.missing.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="mb-1.5 font-medium">Add these to the API service in Render, then redeploy:</p>
                <ul className="space-y-0.5 font-mono">
                  {data.missing.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <p className="mb-1 font-medium">Webhook URL for Meta</p>
              <code className="break-all">{apiBase + WEBHOOK_PATH}</code>
              <p className="mt-1.5 text-muted-foreground">
                Paste this into the WhatsApp product in your Meta app, with the same verify token
                you set in <span className="font-mono">WHATSAPP_WEBHOOK_VERIFY_TOKEN</span>.
              </p>
            </div>

            {/* Worth stating plainly: it changes what the Recycle list can actually send. */}
            <p className="text-xs text-muted-foreground">
              WhatsApp only allows free-form replies within 24 hours of the patient’s last message.
              Older conversations — including everything on the Recycle list — need a message
              template approved by Meta in advance.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
