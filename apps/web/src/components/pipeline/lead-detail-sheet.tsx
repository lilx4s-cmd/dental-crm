'use client';

import { toast } from 'sonner';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  Phone, Mail, MessageCircle, DollarSign, ArrowRight, UserCheck, ExternalLink, Loader2,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DealDocuments } from './deal-documents';
import { IntakeAnswers } from './intake-answers';
import { LeadTasksSection } from './lead-tasks-section';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CLINICAL, STAGE_LABELS } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useLead, useLeadActivities, useConvertLeadToPatient, type Lead } from '@/hooks/use-leads';
import { usePatient } from '@/hooks/use-patients';
import { useAppointments } from '@/hooks/use-appointments';
import { useTreatmentPlans } from '@/hooks/use-treatment-plans';
import { useClinicSettings } from '@/hooks/use-reports';
import { useStartConversation } from '@/hooks/use-conversations';
import { buildWhatsAppLink } from '@/lib/whatsapp';

const BITRIX_DOMAIN = process.env.NEXT_PUBLIC_BITRIX_DOMAIN;

function humanize(value: string) {
  return value.replace(/_/g, ' ').toLowerCase();
}

// Clinical record + appointment history for a lead that has converted to a
// patient. Split out so its three lazy queries (patient/appointments/plans)
// only ever fire once a patient id actually exists to fetch.
function PatientRecordSection({ patientId }: { patientId: string }) {
  const { user } = useAuth();
  // A clinical record is not a sales consultant's to read, so the request is skipped rather than
  // made and refused — a 403 in the console reads as a defect to whoever finds it next.
  const mayReadClinical = (CLINICAL as readonly string[]).includes(user?.role ?? '');

  const { data: patient, isLoading, isError } = usePatient(patientId, mayReadClinical);
  const { data: appointments, isLoading: apptsLoading } = useAppointments(undefined, undefined, undefined, patientId, true);
  const { data: plans, isLoading: plansLoading } = useTreatmentPlans(patientId);

  // Only the clinical block depends on that fetch. It used to return early on failure, so one call
  // this role is not allowed to make took the appointments and the treatment plans down with it —
  // both of which a salesperson may see, and the plans are why they open this panel at all.
  const hasClinicalDetails =
    !!patient && (patient.dateOfBirth || patient.gender || patient.diagnosis || patient.insuranceInfo);

  return (
    <div className="space-y-4">
      {!mayReadClinical ? (
        <p className="text-xs text-muted-foreground">
          Clinical details are not shown for your role. Treatment and appointments are below.
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading patient record…
        </div>
      ) : isError ? (
        <p className="text-xs text-destructive">Couldn&apos;t load the clinical record. Please try again shortly.</p>
      ) : hasClinicalDetails && patient ? (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {patient.dateOfBirth && (
            <>
              <span className="text-muted-foreground">Date of birth</span>
              <span>{format(new Date(patient.dateOfBirth), 'MMM d, yyyy')}</span>
            </>
          )}
          {patient.gender && (
            <>
              <span className="text-muted-foreground">Gender</span>
              <span className="capitalize">{patient.gender.toLowerCase()}</span>
            </>
          )}
          {patient.diagnosis && (
            <>
              <span className="text-muted-foreground">Diagnosis</span>
              <span>{patient.diagnosis}</span>
            </>
          )}
          {patient.insuranceInfo && (
            <>
              <span className="text-muted-foreground">Insurance</span>
              <span>{patient.insuranceInfo}</span>
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No clinical details recorded yet.</p>
      )}

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Appointments</h4>
        {apptsLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : appointments && appointments.length > 0 ? (
          <ul className="space-y-1.5">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{format(new Date(a.startTime), 'MMM d, yyyy')} · {humanize(a.type)}</span>
                <Badge variant="outline" className="capitalize shrink-0">{humanize(a.status)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No appointments yet</p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Treatment Plans</h4>
        {plansLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : plans && plans.length > 0 ? (
          <ul className="space-y-1.5">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{p.title}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="capitalize">{humanize(p.status)}</Badge>
                  <span className="text-muted-foreground">{Number(p.totalCost).toLocaleString()} {p.currency}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No treatment plans yet</p>
        )}
      </div>
    </div>
  );
}

function initials(firstName?: string, lastName?: string | null) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function LeadDetailSheet({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: activities, isLoading: activitiesLoading } = useLeadActivities(open ? lead?.id ?? null : null);
  // The board's payload deliberately omits the enquiry questionnaire — it would ship every
  // patient's medical history just to draw the cards — so the sheet fetches the full record.
  const { data: fullLead } = useLead(open && lead ? lead.id : '');
  const submission = fullLead?.intakeSubmissions?.[0];
  const convert = useConvertLeadToPatient();
  const startConversation = useStartConversation();
  const router = useRouter();
  // Cached clinic-wide (see LeadCard), so this doesn't add an extra request beyond what the board already fires.
  const { data: clinicSettings } = useClinicSettings();
  const whatsappLink = buildWhatsAppLink(
    lead?.whatsappNumber || lead?.phone,
    `${lead?.firstName ?? ''} ${lead?.lastName ?? ''}`.trim(),
    clinicSettings?.clinicName ?? 'the clinic',
  );

  /**
   * Opens the CRM thread with this lead, creating it if they have never written in.
   *
   * Separate from the wa.me link beside the phone number: that one opens WhatsApp on the
   * coordinator's own device, where the reply is invisible to everyone else. This keeps the
   * exchange in the shared inbox, which is the point of having one.
   */
  async function handleOpenThread() {
    if (!lead) return;
    try {
      const conv = await startConversation.mutateAsync({ leadId: lead.id });
      onOpenChange(false);
      router.push(`/inbox?c=${conv.id}`);
    } catch {
      toast.error('Could not open a conversation with this lead');
    }
  }

  async function handleConvert() {
    if (!lead) return;
    try {
      await convert.mutateAsync(lead.id);
      toast.success('Converted to patient');
      onOpenChange(false);
    } catch {
      toast.error('Failed to convert lead');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        {lead && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{initials(lead.firstName, lead.lastName)}</AvatarFallback>
                </Avatar>
                <div>
                  <SheetTitle>{lead.firstName} {lead.lastName ?? ''}</SheetTitle>
                  <SheetDescription>{STAGE_LABELS[lead.stage] ?? lead.stage}</SheetDescription>
                </div>
              </div>
              {BITRIX_DOMAIN && lead.bitrixDealId && (
                <a
                  href={`https://${BITRIX_DOMAIN}/crm/deal/details/${lead.bitrixDealId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Open in Bitrix24 <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.phone}</span>
                  {whatsappLink && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Message on WhatsApp"
                      className="shrink-0 rounded-full p-1 text-success hover:bg-success-muted transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
              {lead.whatsappNumber && (
                <div className="flex items-center gap-2 text-sm">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.whatsappNumber}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.email}</span>
                </div>
              )}
              {lead.estimatedValue != null && (
                <div className="flex items-center gap-2 text-sm font-medium text-success">
                  <DollarSign className="h-4 w-4" />
                  <span>{lead.estimatedValue.toLocaleString()} {lead.currency}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {lead.source && <Badge variant="outline">{lead.source}</Badge>}
                {lead.assignedTo && (
                  <Badge variant="secondary">{lead.assignedTo.firstName} {lead.assignedTo.lastName}</Badge>
                )}
                {lead.lostReason && <Badge variant="destructive">{lead.lostReason}</Badge>}
              </div>

              {lead.notes && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">
                  {lead.notes}
                </p>
              )}

              {(lead.whatsappNumber || lead.phone) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleOpenThread}
                  disabled={startConversation.isPending}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {startConversation.isPending ? 'Opening…' : 'Message in CRM inbox'}
                </Button>
              )}

              {lead.patient ? (
                <Badge variant="success" className="gap-1">
                  <UserCheck className="h-3 w-3" /> Converted to patient
                </Badge>
              ) : (
                lead.stage !== 'LOST' && (
                  <Button size="sm" onClick={handleConvert} disabled={convert.isPending} className="w-full">
                    {convert.isPending ? 'Converting…' : 'Convert to Patient'}
                  </Button>
                )
              )}
            </div>

            <Separator className="my-4" />

            {submission && (
              <>
                <IntakeAnswers submission={submission} />
                <Separator className="my-4" />
              </>
            )}

            <DealDocuments dealId={lead.id} stage={lead.stage} />

            <Separator className="my-4" />

            <LeadTasksSection leadId={lead.id} />

            <Separator className="my-4" />

            <div>
              <h3 className="text-sm font-semibold mb-3">Activity History</h3>
              {activitiesLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : activities && activities.length > 0 ? (
                <ul className="space-y-3">
                  {activities.map((a) => (
                    <li key={a.id} className="text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span>{a.fromStage ? (STAGE_LABELS[a.fromStage] ?? a.fromStage) : '—'}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-medium text-foreground">
                          {a.toStage ? (STAGE_LABELS[a.toStage] ?? a.toStage) : '—'}
                        </span>
                      </div>
                      {a.note && <p className="mt-0.5 text-muted-foreground">{a.note}</p>}
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                        {a.user ? `${a.user.firstName} ${a.user.lastName}` : 'System'} ·{' '}
                        {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No activity yet</p>
              )}
            </div>

            <Separator className="my-4" />

            <div>
              <h3 className="text-sm font-semibold mb-3">Patient Record</h3>
              {lead.patient ? (
                <PatientRecordSection patientId={lead.patient.id} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not yet converted to a patient — clinical details and appointment history will appear here once they are.
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
