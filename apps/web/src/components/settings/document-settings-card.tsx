'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  DocumentConfigurationSchema,
  PROCEDURES,
  consultationCopy,
  type DocumentConfiguration,
} from '@dental-crm/shared';
import { useClinicSettings, useUpdateClinicSettings } from '@/hooks/use-reports';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
export function DocumentSettingsCard() {
  const { data } = useClinicSettings(),
    update = useUpdateClinicSettings(),
    [config, setConfig] = useState<DocumentConfiguration>(DocumentConfigurationSchema.parse({})),
    t = consultationCopy('en');
  useEffect(() => {
    if (data) {
      const parsed = DocumentConfigurationSchema.safeParse(data.documentConfiguration ?? {});
      if (parsed.success) setConfig(parsed.data);
    }
  }, [data]);
  const upload = async (key: 'signature' | 'stamp' | 'logo' | 'coverPhoto', file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 250000) {
      toast.error('Use a PNG or JPEG smaller than 250 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setConfig((c) => ({ ...c, [key]: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  return (
    <section className="space-y-4 rounded-xl border p-6">
      <h2 className="text-xl font-semibold">
        {t.settings} · {t.plan}
      </h2>
      <label className="block text-sm">
        {t.department}
        <Input
          value={config.department}
          onChange={(e) => setConfig({ ...config, department: e.target.value })}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        {(['logo', 'signature', 'stamp', 'coverPhoto'] as const).map((key) => (
          <label key={key} className="space-y-2 text-sm">
            {key === 'signature' ? t.signature : key}
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => void upload(key, e.target.files?.[0])}
              className="block w-full text-xs"
            />
            {config[key] && (
              <>
                <img alt={key} src={config[key]} className="h-16 max-w-40 object-contain" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfig({ ...config, [key]: undefined })}
                >
                  {t.clear}
                </Button>
              </>
            )}
          </label>
        ))}
      </div>
      <h3 className="font-semibold">{t.prices}</h3>
      {config.priceList.map((row, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <select
            aria-label={t.treatment}
            value={row.type}
            onChange={(e) =>
              setConfig({
                ...config,
                priceList: config.priceList.map((p, n) =>
                  n === i ? { ...p, type: e.target.value as typeof p.type } : p,
                ),
              })
            }
            className="rounded border bg-background p-2"
          >
            {PROCEDURES.map((p) => (
              <option key={p} value={p}>
                {t[p]}
              </option>
            ))}
          </select>
          <Input
            aria-label={t.prices}
            value={row.currency}
            onChange={(e) =>
              setConfig({
                ...config,
                priceList: config.priceList.map((p, n) =>
                  n === i ? { ...p, currency: e.target.value.toUpperCase() } : p,
                ),
              })
            }
          />
          <Input
            aria-label={t.unitPrice}
            type="number"
            min="0"
            value={row.unitPrice}
            onChange={(e) =>
              setConfig({
                ...config,
                priceList: config.priceList.map((p, n) =>
                  n === i ? { ...p, unitPrice: Number(e.target.value) } : p,
                ),
              })
            }
          />
          <Input
            aria-label={t.material}
            placeholder={t.material}
            value={row.material ?? ''}
            onChange={(e) =>
              setConfig({
                ...config,
                priceList: config.priceList.map((p, n) =>
                  n === i ? { ...p, material: e.target.value } : p,
                ),
              })
            }
          />
          <Input
            aria-label={t.brand}
            placeholder={t.brand}
            value={row.brand ?? ''}
            onChange={(e) =>
              setConfig({
                ...config,
                priceList: config.priceList.map((p, n) =>
                  n === i ? { ...p, brand: e.target.value } : p,
                ),
              })
            }
          />
          <Button
            variant="outline"
            onClick={() =>
              setConfig({ ...config, priceList: config.priceList.filter((_, n) => n !== i) })
            }
          >
            {t.clear}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setConfig({
            ...config,
            priceList: [
              ...config.priceList,
              { type: 'crown', currency: data?.currency ?? 'USD', unitPrice: 0 },
            ],
          })
        }
      >
        {t.create} {t.unitPrice}
      </Button>
      <div className="grid gap-3 md:grid-cols-3">
        <label>
          {t.healing}
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              aria-label="Minimum months"
              value={config.healing?.minMonths ?? ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  healing:
                    e.target.value === ''
                      ? null
                      : {
                          minMonths: Number(e.target.value),
                          maxMonths: config.healing?.maxMonths ?? Number(e.target.value),
                        },
                })
              }
            />
            <Input
              type="number"
              min="0"
              aria-label="Maximum months"
              value={config.healing?.maxMonths ?? ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  healing:
                    e.target.value === ''
                      ? null
                      : {
                          minMonths: config.healing?.minMonths ?? Number(e.target.value),
                          maxMonths: Number(e.target.value),
                        },
                })
              }
            />
          </div>
        </label>
        <label>
          {t.hotel} · {t.unitPrice}
          <Input
            type="number"
            min="0"
            value={config.defaultHotelRate}
            onChange={(e) => setConfig({ ...config, defaultHotelRate: Number(e.target.value) })}
          />
        </label>
        <label>
          {t.nights} · {t.visit} 1 / 2
          <div className="flex gap-2">
            {[0, 1].map((i) => (
              <Input
                key={i}
                type="number"
                min="0"
                aria-label={`${t.visit} ${i + 1}`}
                value={config.defaultNights[i] ?? 0}
                onChange={(e) => {
                  const nights = [...config.defaultNights];
                  nights[i] = Number(e.target.value);
                  setConfig({ ...config, defaultNights: nights });
                }}
              />
            ))}
          </div>
        </label>
      </div>
      <label className="block text-sm">
        {t.included}
        <Textarea
          value={config.services.join('\n')}
          onChange={(e) =>
            setConfig({ ...config, services: e.target.value.split('\n').filter(Boolean) })
          }
        />
      </label>
      <h3 className="font-semibold">{t.warranty}</h3>
      <p className="text-sm text-muted-foreground">{t.contractual}</p>
      {config.warranties.map((w, i) => (
        <div key={i} className="space-y-2 rounded border p-3">
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t.treatment}
              className="rounded border bg-background p-2"
              value={w.type}
              onChange={(e) =>
                setConfig({
                  ...config,
                  warranties: config.warranties.map((v, n) =>
                    n === i ? { ...v, type: e.target.value as typeof w.type } : v,
                  ),
                })
              }
            >
              {PROCEDURES.map((p) => (
                <option key={p} value={p}>
                  {t[p]}
                </option>
              ))}
            </select>
            <select
              aria-label={t.warranty}
              className="rounded border bg-background p-2"
              value={w.duration}
              onChange={(e) =>
                setConfig({
                  ...config,
                  warranties: config.warranties.map((v, n) =>
                    n === i ? { ...v, duration: e.target.value as typeof w.duration } : v,
                  ),
                })
              }
            >
              <option value="lifetime">Lifetime contractual coverage</option>
              <option value="months">Months</option>
            </select>
            {w.duration === 'months' && (
              <Input
                type="number"
                aria-label="Warranty months"
                min="1"
                value={w.months ?? ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    warranties: config.warranties.map((v, n) =>
                      n === i ? { ...v, months: Number(e.target.value) } : v,
                    ),
                  })
                }
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setConfig({ ...config, warranties: config.warranties.filter((_, n) => n !== i) })
              }
            >
              {t.clear}
            </Button>
          </div>
          <Textarea
            aria-label={t.warranty}
            value={w.summary}
            onChange={(e) =>
              setConfig({
                ...config,
                warranties: config.warranties.map((v, n) =>
                  n === i ? { ...v, summary: e.target.value } : v,
                ),
              })
            }
          />
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setConfig({
            ...config,
            warranties: [
              ...config.warranties,
              { type: 'implant', duration: 'lifetime', summary: '' },
            ],
          })
        }
      >
        {t.create} {t.warranty}
      </Button>
      <div className="flex justify-end">
        <Button
          disabled={update.isPending || !data}
          onClick={() => {
            const parsed = DocumentConfigurationSchema.safeParse(config);
            if (!parsed.success) {
              toast.error(parsed.error.issues.map((i) => i.message).join(' · '));
              return;
            }
            update.mutate(
              { documentConfiguration: parsed.data },
              {
                onSuccess: () => toast.success(t.save),
                onError: (e) => toast.error(e instanceof Error ? e.message : t.save),
              },
            );
          }}
        >
          {t.save}
        </Button>
      </div>
    </section>
  );
}
