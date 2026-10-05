'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PROCEDURES, consultationCopy } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useWarrantyTemplates } from '@/hooks/use-warranties';
import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
const blank = {
  id: '',
  name: '',
  procedureType: 'implant',
  lifetime: true,
  durationMonths: 1,
  termsAndConditions: '',
  maintenanceRequirements: '',
  exclusions: '',
  annualCheckupRequired: false,
  isActive: false,
};
export function WarrantyTemplatesCard() {
  const { accessToken } = useAuth(),
    qc = useQueryClient(),
    templates = useWarrantyTemplates(),
    [form, setForm] = useState(blank),
    [pending, setPending] = useState(false),
    t = consultationCopy('en');
  const save = async () => {
    if (!form.name.trim() || !form.termsAndConditions.trim()) {
      toast.error('Enter a name and approved coverage terms');
      return;
    }
    setPending(true);
    try {
      const { id, ...body } = form;
      await apiRequest(
        id ? `/api/warranty-templates/${id}` : '/api/warranty-templates',
        { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) },
        accessToken ?? undefined,
      );
      await qc.invalidateQueries({ queryKey: ['warranty-templates'] });
      setForm(blank);
      toast.success(t.save);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.save);
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-6">
      <h2 className="text-xl font-semibold">
        {t.settings} · {t.certificate}
      </h2>
      <p className="text-sm text-muted-foreground">{t.contractual}</p>
      <div className="flex flex-wrap gap-2">
        {templates.data?.map((w) => (
          <Button
            key={w.id}
            size="sm"
            variant="outline"
            onClick={() =>
              setForm({
                id: w.id,
                name: w.name,
                procedureType: w.procedureType ?? 'implant',
                lifetime: w.lifetime ?? false,
                durationMonths: w.durationMonths,
                termsAndConditions: w.termsAndConditions,
                maintenanceRequirements: w.maintenanceRequirements ?? '',
                exclusions: w.exclusions ?? '',
                annualCheckupRequired: w.annualCheckupRequired,
                isActive: w.isActive,
              })
            }
          >
            {w.name}
            {w.isActive ? ' ✓' : ''}
          </Button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <Input
          aria-label={t.warranty}
          placeholder={t.warranty}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          aria-label={t.treatment}
          className="rounded border bg-background p-2"
          value={form.procedureType}
          onChange={(e) => {
            const type = e.target.value;
            setForm({
              ...form,
              procedureType: type,
              ...(!form.id
                ? {
                    lifetime: type === 'implant',
                    durationMonths: ['crown', 'veneer', 'implantCrown'].includes(type) ? 240 : 12,
                  }
                : {}),
            });
          }}
        >
          {PROCEDURES.map((p) => (
            <option key={p} value={p}>
              {t[p]}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min="1"
          aria-label={t.months}
          value={form.durationMonths}
          disabled={form.lifetime}
          onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })}
        />
      </div>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.lifetime}
          onChange={(e) => setForm({ ...form, lifetime: e.target.checked })}
        />
        {t.lifetime}
      </label>
      <label className="block text-sm">
        {t.warranty}
        <Textarea
          rows={4}
          value={form.termsAndConditions}
          onChange={(e) => setForm({ ...form, termsAndConditions: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        {t.maintenance}
        <Textarea
          value={form.maintenanceRequirements}
          onChange={(e) => setForm({ ...form, maintenanceRequirements: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        {t.exclusions}
        <Textarea
          value={form.exclusions}
          onChange={(e) => setForm({ ...form, exclusions: e.target.value })}
        />
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.annualCheckupRequired}
          onChange={(e) => setForm({ ...form, annualCheckupRequired: e.target.checked })}
        />
        Annual clinical check-up required
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
        />
        I approve these clinic terms for issuing certificates
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setForm(blank)}>
          {t.reset}
        </Button>
        <Button disabled={pending} onClick={() => void save()}>
          {t.save}
        </Button>
      </div>
    </section>
  );
}
