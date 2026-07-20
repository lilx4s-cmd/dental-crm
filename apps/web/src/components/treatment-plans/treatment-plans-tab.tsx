'use client';

import { useState } from 'react';
import { Plus, Stethoscope, Send, MessageSquare, Link2, Download, Sparkles, MessageCircle } from 'lucide-react';
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
import { TimelineStepper } from './timeline-stepper';
import { WarrantySection } from './warranty-section';

const AI_NOT_CONFIGURED_TOAST = 'AI features are not configured for this clinic';

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

// Keyed on the REAL TreatmentStatus enum (PLANNED | IN_PROGRESS | COMPLETED | CANCELLED).
// The previous version keyed on non-existent 'DRAFT'/'ACTIVE' literals, so badges rendered
// blank and the advance buttons never matched — fixed here.
const PLAN_STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
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
    downloadPdf(plan.id, undefined, lastShareToken ?? undefined).catch(() =>
      toast.error('Failed to download PDF'),
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
          <div className="rounded-md border-l-2 border-violet-400/60 bg-violet-50 px-3 py-2 dark:bg-violet-950/20">
            <p className="flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-400">
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

        {/* Procedures */}
        {plan.items.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-1.5 text-left">Procedure</th>
                  <th className="px-2 py-1.5 text-center">Tooth</th>
                  <th className="px-2 py-1.5 text-left">Material / Brand</th>
                  <th className="px-3 py-1.5 text-right">Qty</th>
                  <th className="px-3 py-1.5 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-1.5">
                      {item.description}
                      {item.treatmentCategory && <span className="ml-1 text-muted-foreground">· {item.treatmentCategory.name}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">{item.toothNumber ?? '—'}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{[item.material, item.brand].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-3 py-1.5 text-right">{item.quantity}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(Number(item.cost), plan.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Timeline</p>
          <TimelineStepper steps={plan.timelineSteps} onStepClick={handleStepClick} />
        </div>

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
  const { data: plans, isLoading } = useTreatmentPlans(patientId);
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
