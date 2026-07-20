'use client';

import { use } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { usePortalPlan } from '@/hooks/use-portal';
import { PortalPlanView } from '@/components/portal/portal-plan-view';

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, isLoading, isError } = usePortalPlan(token);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-lg font-semibold">Link not found</p>
        <p className="text-sm text-muted-foreground">
          This link may have expired or been revoked. Please contact the clinic for a new one.
        </p>
      </div>
    );
  }

  return <PortalPlanView token={token} data={data} />;
}
