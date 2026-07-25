'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Download, PlayCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { PlanAftercare, PlanSchedule, PlanStay } from '@/components/treatment-plans/plan-itinerary';
import { PlanDiagnoses, PlanProcedures } from '@/components/treatment-plans/plan-summary';
import { TimelineStepper } from '@/components/treatment-plans/timeline-stepper';

import { usePortalApprove, usePortalReject, portalPdfUrl, type PortalResponse } from '@/hooks/use-portal';
import { PortalCommentThread } from './portal-comment-thread';
import { PortalWarrantySection } from './portal-warranty-section';

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

const APPROVAL_BADGE: Record<string, { variant: 'warning' | 'success' | 'destructive'; label: string }> = {
  PENDING: { variant: 'warning', label: 'Awaiting your decision' },
  APPROVED: { variant: 'success', label: 'Approved' },
  REJECTED: { variant: 'destructive', label: 'Declined' },
};

export function PortalPlanView({ token, data }: { token: string; data: PortalResponse }) {
  const { plan, clinic } = data;
  const approve = usePortalApprove(token);
  const reject = usePortalReject(token);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [decided, setDecided] = useState(plan.approvalStatus);

  const approval = APPROVAL_BADGE[decided] ?? APPROVAL_BADGE.PENDING;

  const handleApprove = () => {
    approve.mutate(undefined, {
      onSuccess: () => {
        setDecided('APPROVED');
        toast.success('Treatment plan approved. Thank you!');
      },
      onError: () => toast.error('Something went wrong. Please try again.'),
    });
  };

  const handleReject = () => {
    reject.mutate(reason || undefined, {
      onSuccess: () => {
        setDecided('REJECTED');
        setRejectOpen(false);
        toast.success('Your response has been recorded.');
      },
      onError: () => toast.error('Something went wrong. Please try again.'),
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{clinic.clinicName}</h1>
        {[clinic.address, clinic.city, clinic.country].filter(Boolean).length > 0 && (
          <p className="text-sm text-muted-foreground">
            {[clinic.address, clinic.city, clinic.country].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <p className="text-lg font-semibold">{plan.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Prepared for {plan.patient.firstName} {plan.patient.lastName} · {format(new Date(plan.createdAt), 'MMM d, yyyy')}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="text-lg font-semibold">{fmt(Number(plan.totalCost), plan.currency)}</span>
            <Badge variant={approval.variant}>{approval.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {plan.aiSummary && (
            <div className="rounded-md border-l-2 border-violet-400/60 bg-violet-50 px-3 py-3 dark:bg-violet-950/20">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400">
                <Sparkles className="h-3.5 w-3.5" /> A simple explanation of your plan
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{plan.aiSummary}</p>
            </div>
          )}

          {plan.doctorRecommendation && (
            <div className="rounded-md border-l-2 border-primary/40 bg-muted/30 px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground">Doctor&apos;s recommendation</p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{plan.doctorRecommendation}</p>
            </div>
          )}

          {plan.rejectionReason && decided === 'REJECTED' && (
            <div className="rounded-md border-l-2 border-destructive/60 bg-destructive/5 px-3 py-2">
              <p className="text-xs font-semibold text-destructive">Your reason</p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{plan.rejectionReason}</p>
            </div>
          )}

          {/* The same charts and phased pricing the printed document shows, rendered from the
              same components — a patient comparing the two should see one plan, not two. */}
          <PlanDiagnoses plan={plan} />

          {plan.items.length > 0 && (
            <Link href={`/portal/${token}/animation`} className="block">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10">
                <div>
                  <p className="text-sm font-semibold">See your treatment step by step</p>
                  <p className="text-xs text-muted-foreground">
                    Watch how your teeth change at each stage of the plan.
                  </p>
                </div>
                <PlayCircle className="h-7 w-7 shrink-0 text-primary" />
              </div>
            </Link>
          )}

          <PlanProcedures plan={plan} />

          {/* The travel and aftercare pages of the printed dossier, so the link and the paper
              agree. */}
          <PlanStay stay={plan.stay} />
          <PlanSchedule items={plan.scheduleItems} />
          <PlanAftercare items={plan.items} />

          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">Treatment Timeline</p>
            <TimelineStepper steps={plan.timelineSteps} />
          </div>

          <PortalWarrantySection items={plan.items} />

          <PortalCommentThread token={token} comments={plan.comments} />

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <a href={portalPdfUrl(token)} target="_blank" rel="noreferrer">
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </a>
            {decided === 'PENDING' && (
              <>
                <Button onClick={handleApprove} disabled={approve.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                </Button>
                <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={reject.isPending}>
                  <XCircle className="mr-2 h-4 w-4" /> Decline
                </Button>
              </>
            )}
            {decided === 'APPROVED' && (
              <span className="flex items-center gap-1.5 text-sm text-green-700">
                <ShieldCheck className="h-4 w-4" /> You approved this plan.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this treatment plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Let the clinic know why, so they can follow up with you (optional).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={reject.isPending}>
              Confirm Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
