'use client';

import { useState } from 'react';
import { Plus, Plane, Stethoscope, Send, MessageSquare, Link2, Download, Sparkles, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import {
  useTreatmentPlans,
  useUpdateTreatmentPlan,
  useAddTreatmentPlanComment,
  useUpdateTimelineStep,
  useCreateShareLink,
  useDownloadPlanPdf,
  type TreatmentPlan,
  type TimelineStep,
} from '@/hooks/use-treatment-plans';
import { useDentists, useCoordinators } from '@/hooks/use-users';
import { useGenerateSummary, useDraftWhatsAppMessage, isAiNotConfiguredError } from '@/hooks/use-ai';
import { normalizePhoneForWhatsApp } from '@/lib/whatsapp';
import { NewTreatmentPlanDialog } from './new-treatment-plan-dialog';
import { EditItineraryDialog } from './edit-itinerary-dialog';
import { PlanAftercare, PlanSchedule, PlanStay } from './plan-itinerary';
import { PlanDiagnoses, PlanProcedures } from './plan-summary';
import { TimelineStepper } from './timeline-stepper';
import { WarrantySection } from './warranty-section';
import { PackagePaymentSection } from './package-payment-section';
import { LabOrdersSection } from './lab-orders-section';
import { BookScheduleItemDialog, type BookableScheduleItem } from './book-schedule-item-dialog';
import { QueryError } from '@/components/ui/query-state';
import { formatMoney } from '@/lib/money';

const AI_NOT_CONFIGURED_TOAST = 'AI features are not configured for this clinic';

const fmt = formatMoney;

// Keyed on the REAL TreatmentStatus enum (PLANNED | IN_PROGRESS | COMPLETED | CANCELLED).
// The previous version keyed on non-existent 'DRAFT'/'ACTIVE' literals, so badges rendered
// blank and the advance buttons never matched — fixed here.
const PLAN_STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-muted text-muted-foreground',
  IN_PROGRESS: 'bg-warning-muted text-warning-muted-foreground',
  COMPLETED: 'bg-success-muted text-success-muted-foreground',
  CANCELLED: 'bg-destructive-muted text-destructive-muted-foreground',
};

const APPROVAL_BADGE: Record<string, { variant: 'warning' | 'success' | 'destructive'; label: string }> = {
  PENDING: { variant: 'warning', label: 'Awaiting patient' },
  APPROVED: { variant: 'success', label: 'Patient approved' },
  REJECTED: { variant: 'destructive', label: 'Patient rejected' },
};

// Clicking a timeline node cycles it forward through the common path; COMPLETED wraps back to
// PENDING so a mis-click is recoverable. SKIPPED is reachable via the same cycle end if needed.
const NEXT_STEP_STATUS: Record<string, string> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: 'PENDING',
  SKIPPED: 'PENDING',
};

function CommentThread({ plan, patientId }: { plan: TreatmentPlan; patientId: string }) {
  const addComment = useAddTreatmentPlanComment(patientId);
  const [body, setBody] = useState('');

  const submit = () => {
    if (!body.trim()) return;
    addComment.mutate(
      { id: plan.id, body },
      { onSuccess: () => setBody(''), onError: () => toast.error('Failed to post comment') },
    );
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" /> Discussion
      </p>
      {plan.comments.length > 0 ? (
        <ul className="space-y-2">
          {plan.comments.map((c) => (
            <li key={c.id} className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {c.authorType === 'PATIENT'
                    ? `${c.authorName ?? 'Patient'} (patient)`
                    : c.authorUser
                      ? `${c.authorUser.firstName} ${c.authorUser.lastName}`
                      : 'Staff'}
                </span>
                <span className="text-muted-foreground">{format(new Date(c.createdAt), 'MMM d, HH:mm')}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      )}
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs"
          placeholder="Write a reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Button size="sm" className="h-8" onClick={submit} disabled={addComment.isPending || !body.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function PlanCard({ plan, patientId, patientPhone }: { plan: TreatmentPlan; patientId: string; patientPhone?: string | null }) {
  const update = useUpdateTreatmentPlan(patientId);
  const updateStep = useUpdateTimelineStep(patientId);
  const createShareLink = useCreateShareLink(patientId);
  const downloadPdf = useDownloadPlanPdf();
  const { data: dentists } = useDentists();
  const { data: coordinators } = useCoordinators();
  const generateSummary = useGenerateSummary(patientId);
  const draftWhatsApp = useDraftWhatsAppMessage();
  const [summaryLanguage, setSummaryLanguage] = useState('');
  // Raw share-link token, held only in memory for this session — set right after "Copy
  // portal link" succeeds. Never persisted/recoverable later (by design, only its hash is
  // stored server-side), so it's used opportunistically to embed a working QR in the PDF.
  const [lastShareToken, setLastShareToken] = useState<string | null>(null);
  const [editingItinerary, setEditingItinerary] = useState(false);
  // The itinerary line waiting to be turned into a booking.
  const [bookingItem, setBookingItem] = useState<BookableScheduleItem | null>(null);

  const handleGenerateSummary = () => {
    generateSummary.mutate(
      { planId: plan.id, language: summaryLanguage.trim() || undefined },
      {
        onSuccess: () => toast.success('Patient-friendly summary generated'),
        onError: (err) =>
          toast.error(isAiNotConfiguredError(err) ? AI_NOT_CONFIGURED_TOAST : 'Failed to generate summary'),
      },
    );
  };

  const handleDraftWhatsApp = () => {
    draftWhatsApp.mutate(
      { treatmentPlanId: plan.id },
      {
        onSuccess: ({ message }) => {
          const phone = normalizePhoneForWhatsApp(patientPhone ?? '');
          if (!phone) {
            toast.error('No WhatsApp-capable phone number on file for this patient');
            return;
          }
          const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
          window.open(url, '_blank', 'noopener,noreferrer');
        },
        onError: (err) =>
          toast.error(isAiNotConfiguredError(err) ? AI_NOT_CONFIGURED_TOAST : 'Failed to draft WhatsApp message'),
      },
    );
  };

  const handleCopyLink = () => {
    createShareLink.mutate(plan.id, {
      onSuccess: ({ token }) => {
        setLastShareToken(token);
        const url = `${window.location.origin}/portal/${token}`;
        navigator.clipboard
          .writeText(url)
          .then(() => toast.success('Portal link copied to clipboard'))
          .catch(() => toast.error('Failed to copy link'));
      },
      onError: () => toast.error('Failed to create portal link'),
    });
  };

  const handleDownloadPdf = () => {
    // If we don't have a raw token in memory (no share link created this session), the PDF
    // still downloads fine — it just won't include a QR code linking to the patient portal.
    // Show what actually went wrong — an expired session and a server error need different
    // responses from the user, and a single blanket message told them apart from neither.
    downloadPdf(plan.id, undefined, lastShareToken ?? undefined).catch((e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Failed to download PDF'),
    );
  };

  const approval = APPROVAL_BADGE[plan.approvalStatus] ?? APPROVAL_BADGE.PENDING;
  const isTerminal = plan.status === 'COMPLETED' || plan.status === 'CANCELLED';

  const advance = (status: string) => update.mutate({ id: plan.id, status });

  const handleStepClick = (step: TimelineStep) =>
    updateStep.mutate({ planId: plan.id, stepId: step.id, status: NEXT_STEP_STATUS[step.status] ?? 'PENDING' });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{plan.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {format(new Date(plan.createdAt), 'MMM d, yyyy')} · {plan.items.length} procedure{plan.items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="text-sm font-semibold">{fmt(Number(plan.totalCost), plan.currency)}</span>
          <Badge className={PLAN_STATUS_COLORS[plan.status] ?? ''} variant="outline">
            {plan.status.replace(/_/g, ' ')}
          </Badge>
          <Badge variant={approval.variant}>{approval.label}</Badge>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCopyLink} disabled={createShareLink.isPending}>
            <Link2 className="mr-1 h-3.5 w-3.5" /> Copy portal link
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDownloadPdf}>
            <Download className="mr-1 h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4 pt-0">
        {/* Assignment */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Dentist</label>
            <Select value={plan.assignedDentistId ?? ''} onValueChange={(v) => update.mutate({ id: plan.id, assignedDentistId: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {dentists?.map((d) => <SelectItem key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Coordinator</label>
            <Select value={plan.assignedCoordinatorId ?? ''} onValueChange={(v) => update.mutate({ id: plan.id, assignedCoordinatorId: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {coordinators?.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {plan.doctorRecommendation && (
          <div className="rounded-md border-l-2 border-primary/40 bg-muted/30 px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground">Doctor's recommendation</p>
            <p className="mt-0.5 text-xs whitespace-pre-wrap">{plan.doctorRecommendation}</p>
          </div>
        )}

        {plan.aiSummary && (
          <div className="rounded-md border-l-2 border-info/50 bg-info-muted px-3 py-2">
            <p className="flex items-center gap-1 text-xs font-semibold text-info-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> AI patient-friendly summary
            </p>
            <p className="mt-0.5 text-xs whitespace-pre-wrap">{plan.aiSummary}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-7 w-36 text-xs"
            placeholder="Language (optional)"
            value={summaryLanguage}
            onChange={(e) => setSummaryLanguage(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleGenerateSummary}
            disabled={generateSummary.isPending}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Generate patient-friendly summary
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleDraftWhatsApp}
            disabled={draftWhatsApp.isPending}
          >
            <MessageCircle className="mr-1 h-3.5 w-3.5" /> Draft WhatsApp message
          </Button>
        </div>

        {plan.rejectionReason && plan.approvalStatus === 'REJECTED' && (
          <div className="rounded-md border-l-2 border-destructive/60 bg-destructive/5 px-3 py-2">
            <p className="text-xs font-semibold text-destructive">Rejection reason</p>
            <p className="mt-0.5 text-xs whitespace-pre-wrap">{plan.rejectionReason}</p>
          </div>
        )}

        {/* Charted findings, then the proposed work — the order the patient document reads in. */}
        <PlanDiagnoses plan={plan} />
        <PlanProcedures plan={plan} />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Travel &amp; itinerary</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingItinerary(true)}>
              <Plane className="mr-1 h-3 w-3" /> Stay &amp; schedule
            </Button>
          </div>
          <PlanStay stay={plan.stay} />
          <PlanSchedule
            items={plan.scheduleItems}
            planId={plan.id}
            patientId={patientId}
            onBook={setBookingItem}
          />
        </div>

        <PlanAftercare items={plan.items} />

        {/* What the price covers and how it is paid. Both already print on the dossier; until now
            nothing could set them, so every plan carried whatever the clinic defaults happened to
            be on the day it was created. */}
        <PackagePaymentSection plan={plan} patientId={patientId} />

        <BookScheduleItemDialog
          planId={plan.id}
          patientId={patientId}
          item={bookingItem}
          open={!!bookingItem}
          onClose={() => setBookingItem(null)}
        />

        <EditItineraryDialog
          plan={plan}
          patientId={patientId}
          open={editingItinerary}
          onClose={() => setEditingItinerary(false)}
        />

        {/* Timeline */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Timeline</p>
          <TimelineStepper steps={plan.timelineSteps} onStepClick={handleStepClick} />
        </div>

        {/* Cases out at the lab. Sits beside warranties: both are things that happen to the
            work after it is quoted, and both are asked about by date. */}
        <LabOrdersSection planId={plan.id} />

        {/* Warranties */}
        <WarrantySection plan={plan} patientId={patientId} />

        {/* Comments */}
        <CommentThread plan={plan} patientId={patientId} />

        {/* Status actions */}
        {!isTerminal && (
          <div className="flex gap-2 border-t pt-3">
            {plan.status === 'PLANNED' && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => advance('IN_PROGRESS')}>
                Start Treatment
              </Button>
            )}
            {plan.status === 'IN_PROGRESS' && (
              <Button size="sm" className="h-7 text-xs" onClick={() => advance('COMPLETED')}>
                Mark Completed
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => advance('CANCELLED')}>
              Cancel Plan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TreatmentPlansTab({ patientId, patientPhone }: { patientId: string; patientPhone?: string | null }) {
  const query = useTreatmentPlans(patientId);
  const { data: plans, isLoading } = query;
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Plan
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : query.isError ? (
        // A coordinator who sees "no treatment plans yet" on a patient who has one will quote the
        // case again from scratch, and the second quote will not match the first.
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : !plans?.length ? (
        <div className="py-10 text-center text-muted-foreground">
          <Stethoscope className="mx-auto mb-2 h-8 w-8 opacity-30" />
          <p className="text-sm">No treatment plans yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} patientId={patientId} patientPhone={patientPhone} />
          ))}
        </div>
      )}
      <NewTreatmentPlanDialog patientId={patientId} open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
