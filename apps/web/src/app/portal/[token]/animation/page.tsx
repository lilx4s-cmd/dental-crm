'use client';

import { use } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePortalPlan } from '@/hooks/use-portal';
import { TreatmentAnimation } from '@/components/portal/treatment-animation';

export default function PortalAnimationPage({ params }: { params: Promise<{ token: string }> }) {
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

  const { plan, clinic } = data;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{clinic.clinicName}</h1>
        <p className="text-sm text-muted-foreground">
          {plan.title} · {plan.patient.firstName} {plan.patient.lastName}
        </p>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold">Your treatment, step by step</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Watch how your teeth change at each stage of the plan.
        </p>
      </div>

      <TreatmentAnimation plan={plan} />

      <div className="flex justify-center pt-2">
        <Link href={`/portal/${token}`}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to your plan
          </Button>
        </Link>
      </div>
    </div>
  );
}
