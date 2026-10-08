'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DOCUMENT_LANGUAGES,
  consultationCopy,
  hasPermission,
  Role,
  type Consultation,
  type ConsultationPaymentTerms,
} from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { apiRequest, apiRequestBlob, saveBlob } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useTreatmentPlans } from '@/hooks/use-treatment-plans';
import { type ConsultationSource } from './consultation-editor';
const Certificates = dynamic(
  () => import('./completed-treatment-certificates').then((m) => m.CompletedTreatmentCertificates),
  { ssr: false },
);
const Editor = dynamic(() => import('./consultation-editor').then((m) => m.ConsultationEditor), {
  ssr: false,
});
interface Version {
  id: string;
  kind: 'PLAN' | 'INVOICE' | 'WARRANTY';
  sourceId: string;
  version: number;
  createdAt: string;
  createdById: string;
  language: Consultation['language'];
}
export function ClinicalDocuments({ patientId, leadId }: { patientId?: string; leadId?: string }) {
  const { user } = useAuth();
  if (
    !user ||
    !hasPermission(
      user,
      'plans.read',
      (
        [Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.SALES_CONSULTANT, Role.DENTIST] as Role[]
      ).includes(user.role),
    )
  )
    return null;
  return <DocumentPanel patientId={patientId} leadId={leadId} />;
}
function DocumentPanel({ patientId, leadId }: { patientId?: string; leadId?: string }) {
  const { accessToken, user } = useAuth(),
    qc = useQueryClient(),
    [editing, setEditing] = useState(false),
    [initial, setInitial] = useState<Consultation | undefined>(),
    [initialPayment, setInitialPayment] = useState<ConsultationPaymentTerms | undefined>(),
    [pending, setPending] = useState(false),
    [older, setOlder] = useState(false);
  const query = new URLSearchParams(patientId ? { patientId } : { leadId: leadId! }).toString();
  const context = useQuery<
    ConsultationSource & {
      patient: ConsultationSource['patient'] & { email?: string | null };
      mailConfigured: boolean;
    }
  >({
    queryKey: ['document-context', patientId, leadId],
    queryFn: () => apiRequest(`/api/documents/context?${query}`, {}, accessToken ?? undefined),
  });
  const documents = useQuery<Version[]>({
    queryKey: ['documents', patientId, leadId],
    queryFn: () => apiRequest(`/api/documents?${query}`, {}, accessToken ?? undefined),
    enabled: !!context.data,
  });
  const plans = useTreatmentPlans(context.data?.patient.id ?? '');
  const t = consultationCopy(
    initial?.language ??
      (DOCUMENT_LANGUAGES.includes(context.data?.preferredLanguage as Consultation['language'])
        ? (context.data?.preferredLanguage as Consultation['language'])
        : 'en'),
  );
  const canFinance =
    !!user &&
    hasPermission(
      user,
      'finance.write',
      user.role === Role.SUPER_ADMIN || user.role === Role.CLINIC_MANAGER,
    );
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ['documents'] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.create);
    } finally {
      setPending(false);
    }
  };
  const download = async (doc: Version) => {
    const blob = await apiRequestBlob(`/api/documents/${doc.id}/pdf`, accessToken ?? undefined);
    saveBlob(blob, `${doc.kind.toLowerCase()}-${doc.id}-v${doc.version}.pdf`);
  };
  const current = (documents.data ?? []).filter(
    (doc, i, all) => all.findIndex((v) => v.kind === doc.kind && v.sourceId === doc.sourceId) === i,
  );
  const visible = older ? (documents.data ?? []) : current;
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {t.plan} · {t.invoice} · {t.warranty}
        </h3>
        <Button
          size="sm"
          disabled={!context.data || pending || !hasPermission(user, 'plans.write', true)}
          onClick={() => {
            setInitial(undefined);
            setInitialPayment(undefined);
            setEditing(true);
          }}
        >
          {t.create} {t.plan}
        </Button>
      </div>
      {context.isError && (
        <p className="text-sm text-muted-foreground">
          {context.error instanceof Error ? context.error.message : t.patient}
        </p>
      )}
      {documents.isError && (
        <p role="alert" className="text-sm text-destructive">
          {documents.error instanceof Error ? documents.error.message : t.history}
        </p>
      )}
      <div className="space-y-2">
        {visible.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs"
          >
            <span className="min-w-0 flex-1">
              {t[doc.kind === 'PLAN' ? 'plan' : doc.kind === 'INVOICE' ? 'invoice' : 'certificate']}{' '}
              · v{doc.version} · {doc.language.toUpperCase()} ·{' '}
              {new Date(doc.createdAt).toLocaleDateString()}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || (doc.kind === 'INVOICE' && !canFinance)}
              onClick={() => void run(() => download(doc))}
            >
              {t.download}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || (doc.kind === 'INVOICE' && !canFinance)}
              onClick={() => {
                const preview = window.open('about:blank', '_blank');
                if (preview) preview.opener = null;
                void run(async () => {
                  const blob = await apiRequestBlob(
                    `/api/documents/${doc.id}/pdf`,
                    accessToken ?? undefined,
                  );
                  const url = URL.createObjectURL(blob);
                  if (preview) preview.location.replace(url);
                  else saveBlob(blob, `${doc.kind}-${doc.version}.pdf`);
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                });
              }}
            >
              {t.preview}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || (doc.kind === 'INVOICE' && !canFinance)}
              onClick={() =>
                void run(() =>
                  apiRequest(
                    `/api/documents/${doc.id}/regenerate`,
                    { method: 'POST' },
                    accessToken ?? undefined,
                  ),
                )
              }
            >
              {t.regenerate}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                pending ||
                (doc.kind === 'INVOICE' && !canFinance) ||
                !context.data?.mailConfigured ||
                !context.data.patient.email
              }
              title={context.data?.patient.email ?? t.patient}
              onClick={() => {
                if (window.confirm(`${t.send}: ${context.data?.patient.email}`))
                  void run(() =>
                    apiRequest(
                      `/api/documents/${doc.id}/send`,
                      { method: 'POST' },
                      accessToken ?? undefined,
                    ),
                  );
              }}
            >
              {t.send}
            </Button>
            {doc.kind === 'PLAN' && canFinance && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    apiRequest(
                      `/api/documents/plans/${doc.sourceId}/invoice`,
                      { method: 'POST' },
                      accessToken ?? undefined,
                    ),
                  )
                }
              >
                {t.create} {t.invoice}
              </Button>
            )}
            {doc.kind === 'PLAN' && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const saved = plans.data?.find((p) => p.id === doc.sourceId);
                  if (saved?.consultation) {
                    setInitial(saved.consultation);
                    setInitialPayment({ terms: saved.paymentTerms, cardFee: saved.cardFeePercent == null ? null : Number(saved.cardFeePercent), cashDiscount: saved.cashDiscountPercent == null ? null : Number(saved.cashDiscountPercent), depositAmount: saved.depositAmount == null ? null : Number(saved.depositAmount), depositPercent: null });
                    setEditing(true);
                  }
                }}
              >
                {t.plan} · {t.create}
              </Button>
            )}
          </div>
        ))}
      </div>
      {!!documents.data?.length && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setOlder((v) => !v)}
        >
          {t.history} ({documents.data.length})
        </button>
      )}
      {context.data &&
        user &&
        ([Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST] as Role[]).includes(user.role) && (
          <Certificates patientId={context.data.patient.id} />
        )}
      {editing && context.data && (
        <Editor source={context.data} initial={initial} initialPayment={initialPayment} onClose={() => setEditing(false)} />
      )}
    </section>
  );
}
