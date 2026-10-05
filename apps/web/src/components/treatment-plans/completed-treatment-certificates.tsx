'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consultationCopy } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useTreatmentPlans } from '@/hooks/use-treatment-plans';
import { useWarrantyTemplates, usePatientWarranties } from '@/hooks/use-warranties';
import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function CompletedTreatmentCertificates({ patientId }: { patientId: string }) {
  const { accessToken } = useAuth(),
    qc = useQueryClient(),
    plans = useTreatmentPlans(patientId),
    templates = useWarrantyTemplates(true),
    warranties = usePatientWarranties(patientId);
  const [itemId, setItemId] = useState(''),
    [templateId, setTemplateId] = useState(''),
    [date, setDate] = useState(''),
    [pending, setPending] = useState(false);
  const t = consultationCopy('en'),
    items = (plans.data ?? []).flatMap((p) => p.items),
    item = items.find((i) => i.id === itemId);
  const run = async (fn: () => Promise<unknown>) => {
    setPending(true);
    try {
      await fn();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['documents'] }),
        qc.invalidateQueries({ queryKey: ['treatment-plans'] }),
        qc.invalidateQueries({ queryKey: ['warranties'] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.certificate);
    } finally {
      setPending(false);
    }
  };
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {t.certificate} · {t.completion}
      </summary>
      <div className="mt-3 space-y-2">
        <select
          aria-label={t.treatment}
          className="w-full rounded border bg-background p-2"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          <option value="">{t.treatment}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.description} · {i.toothNumber ?? 'FDI —'} · {i.status}
            </option>
          ))}
        </select>
        {item && (item.status !== 'COMPLETED' || !item.completedAt) && (
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-xs text-muted-foreground">{t.completionDate}</span>
            <Input
              type="date"
              aria-label={t.completion}
              max={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button
              disabled={!date || pending}
              onClick={() => {
                if (window.confirm(`${t.completion}: ${item.description} · ${date}`))
                  void run(() =>
                    apiRequest(
                      `/api/documents/items/${item.id}/complete`,
                      { method: 'POST', body: JSON.stringify({ completedAt: date }) },
                      accessToken ?? undefined,
                    ),
                  );
              }}
            >
              {t.save} · {t.completion}
            </Button>
          </div>
        )}
        <select
          aria-label={t.warranty}
          className="w-full rounded border bg-background p-2"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">{t.warranty}</option>
          {templates.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t.contractual}</p>
        <Button
          size="sm"
          disabled={pending || item?.status !== 'COMPLETED' || !item.completedAt || !templateId}
          onClick={() =>
            void run(async () => {
              const warranty = await apiRequest<{ id: string }>(
                `/api/treatment-plan-items/${itemId}/warranty`,
                { method: 'POST', body: JSON.stringify({ warrantyTemplateId: templateId }) },
                accessToken ?? undefined,
              );
              await apiRequest(
                `/api/documents/warranties/${warranty.id}`,
                { method: 'POST' },
                accessToken ?? undefined,
              );
            })
          }
        >
          {t.create} {t.certificate}
        </Button>
        {warranties.data?.map((w) => (
          <div key={w.id} className="flex items-center justify-between text-xs">
            <span>{w.treatmentPlanItem.description}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void run(() =>
                  apiRequest(
                    `/api/documents/warranties/${w.id}`,
                    { method: 'POST' },
                    accessToken ?? undefined,
                  ),
                )
              }
            >
              {t.regenerate} {t.certificate}
            </Button>
          </div>
        ))}
      </div>
    </details>
  );
}
