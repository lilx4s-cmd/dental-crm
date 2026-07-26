'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HardDrive, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

interface StorageStatus {
  configured: boolean;
  reachable: boolean;
  missing: string[];
  bucket: string | null;
  error: string | null;
}

/**
 * Whether file uploads actually work.
 *
 * Exists because the failure mode is silent: everything else in the app runs perfectly with
 * storage unconfigured, and the first sign of trouble is a coordinator being told an upload failed
 * mid-consultation. This says so up front, and names the variable that is missing.
 */
export function StorageStatusCard() {
  const { accessToken } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery<StorageStatus>({
    queryKey: ['storage-status'],
    queryFn: () => apiRequest('/api/files/storage-status', {}, accessToken ?? undefined),
  });

  const ok = data?.configured && data?.reachable;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            File storage
          </CardTitle>
          <CardDescription>
            Photos, x-rays, passports and warranty certificates. Without it the rest of the CRM
            still works — only uploads fail.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </p>
        ) : ok ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            Working — uploading to <code className="rounded bg-muted px-1">{data?.bucket}</code>
          </p>
        ) : (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning-muted-foreground" />
              {data?.configured
                ? 'Configured, but storage did not respond'
                : 'Not set up — uploads will fail'}
            </p>

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

            {/* Shown when the keys are present but wrong — a typo'd key or a bucket that was
                never created reads very differently from having set nothing at all. */}
            {data?.configured && data.error && (
              <p className="rounded-md border border-destructive/25 bg-destructive-muted px-3 py-2 text-xs text-destructive-muted-foreground">
                {data.error}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
