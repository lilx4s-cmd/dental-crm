'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import {
  NotificationSetup,
  NotificationStatus,
} from '@/components/notifications/notification-setup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const defaults = {
  whatsapp: false,
  push: false,
  optIn: false,
  language: 'en',
  timezone: 'Europe/Istanbul',
  days: [1, 2, 3, 4, 5],
  start: 540,
  end: 1080,
};
interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  notificationPhone: string | null;
  notificationPreferences: typeof defaults | null;
}
interface AdminData {
  settings: {
    enabled: boolean;
    supervisorId: string | null;
    reminderMinutes: number;
    escalationMinutes: number;
    excludedStages: string[];
  };
  staff: Staff[];
  whatsapp: { label: string; canSend: boolean; sendingNumber: string | null };
  push: { configured: boolean };
  workerEnabled: boolean;
  results: {
    id: string;
    userId: string;
    kind: string;
    channel: string;
    state: string;
    error: string | null;
    createdAt: string;
    attempts: number;
  }[];
}
function Preferences({
  staffId,
  initial,
  phone,
  admin,
}: {
  staffId?: string;
  initial: typeof defaults;
  phone: string | null;
  admin: boolean;
}) {
  const { accessToken } = useAuth(),
    qc = useQueryClient();
  const [p, setP] = useState(initial),
    [number, setNumber] = useState(phone ?? ''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState('');
  useEffect(() => {
    setP(initial);
    setNumber(phone ?? '');
  }, [JSON.stringify(initial), phone, staffId]);
  const run = async (test = false) => {
    setBusy(true);
    try {
      if (test && !window.confirm(`Send a WhatsApp test alert only to ${number}?`)) return;
      const data = await apiRequest<{ state?: string; error?: string }>(
        test
          ? `/api/staff-alerts/staff/${staffId}/test`
          : admin
            ? `/api/staff-alerts/staff/${staffId}`
            : '/api/staff-alerts/me',
        {
          method: test ? 'POST' : 'PATCH',
          ...(!test ? { body: JSON.stringify({ phone: number, preferences: p }) } : {}),
        },
        accessToken ?? undefined,
      );
      setResult(
        test
          ? data.state === 'ACCEPTED'
            ? 'Accepted by WhatsApp; delivery has not been confirmed.'
            : (data.error ?? data.state ?? 'Test failed')
          : 'Preferences saved',
      );
      await qc.invalidateQueries({ queryKey: ['notification-admin'] });
      await qc.invalidateQueries({ queryKey: ['notification-status'] });
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  const clock = (n: number) =>
    `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <label className="block">
        Staff notification phone (country code)
        <Input
          type="tel"
          autoComplete="tel"
          placeholder="+12025550123"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        This is the employee’s number, separate from patient phone numbers.
      </p>
      {(['whatsapp', 'push', 'optIn'] as const).map((k) => (
        <label key={k} className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={p[k]}
            onChange={(e) => setP({ ...p, [k]: e.target.checked })}
          />
          {k === 'optIn'
            ? 'Employee has opted in to WhatsApp alerts'
            : k === 'whatsapp'
              ? 'WhatsApp alerts'
              : 'CRM push alerts'}
        </label>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Preferred language
          <select
            className="block min-h-11 w-full rounded border p-2"
            value={p.language}
            onChange={(e) => setP({ ...p, language: e.target.value })}
          >
            {['en', 'ar', 'fr', 'de', 'es', 'it', 'tr', 'pl', 'hr', 'ru'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          Timezone
          <Input value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })} />
        </label>
        <label>
          Working hours start
          <Input
            type="time"
            value={clock(p.start)}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              setP({ ...p, start: h * 60 + m });
            }}
          />
        </label>
        <label>
          Working hours end
          <Input
            type="time"
            value={clock(p.end)}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              setP({ ...p, end: h * 60 + m || 1440 });
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
          <label key={day} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={p.days.includes(i)}
              onChange={(e) =>
                setP({
                  ...p,
                  days: e.target.checked ? [...p.days, i] : p.days.filter((d) => d !== i),
                })
              }
            />
            {day}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void run()}>
          Save preferences
        </Button>
        {admin && (
          <Button
            disabled={
              busy ||
              !number ||
              !p.whatsapp ||
              !p.optIn ||
              number !== (phone ?? '') ||
              JSON.stringify(p) !== JSON.stringify(initial)
            }
            variant="outline"
            onClick={() => void run(true)}
          >
            Send test alert
          </Button>
        )}
      </div>
      {result && <p role="status">{result}</p>}
    </div>
  );
}
export default function NotificationsPage() {
  const { user, accessToken } = useAuth(),
    qc = useQueryClient(),
    admin = user?.role === 'SUPER_ADMIN' || user?.role === 'CLINIC_MANAGER';
  const own = useQuery<NotificationStatus>({
    queryKey: ['notification-status', user?.sub],
    queryFn: () => apiRequest('/api/staff-alerts/me', {}, accessToken ?? undefined),
    enabled: !!user,
  });
  const data = useQuery<AdminData>({
    queryKey: ['notification-admin'],
    queryFn: () => apiRequest('/api/staff-alerts/admin', {}, accessToken ?? undefined),
    enabled: admin,
    refetchInterval: 15000,
  });
  const [selected, setSelected] = useState(''),
    [settings, setSettings] = useState<AdminData['settings'] | null>(null),
    [result, setResult] = useState('');
  useEffect(() => {
    if (data.data && !settings) setSettings(data.data.settings);
  }, [data.data, settings]);
  const staff = data.data?.staff.find((s) => s.id === selected);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <NotificationSetup always />
      {own.isError && <p role="alert">Unable to load your notification preferences.</p>}
      {own.data && (
        <Preferences
          initial={own.data.preferences}
          phone={own.data.notificationPhone}
          admin={false}
        />
      )}
      {admin && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Clinic alert controls</h2>
          {data.isError && <p role="alert">Unable to load alert controls.</p>}
          {data.data && (
            <>
              <p>
                WhatsApp: {data.data.whatsapp.label} ·{' '}
                {data.data.whatsapp.canSend ? 'Sending available' : 'Unavailable'} · Sending number:{' '}
                {data.data.whatsapp.sendingNumber ?? 'Not reported by this connector'}
              </p>
              <p className="text-sm">
                Linked phone sessions depend on connection availability. Accepted messages are not
                confirmed deliveries.
              </p>
              <p>
                Push server:{' '}
                {data.data.push.configured ? 'Configured' : 'VAPID configuration required'} ·
                Background worker:{' '}
                {data.data.workerEnabled ? 'Enabled' : 'Enable on the API server'}
              </p>
              {settings && (
                <div className="space-y-3 rounded border p-4">
                  <label className="flex min-h-11 gap-3 items-center">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                    />
                    Enable automatic lead alerts
                  </label>
                  <label className="block">
                    Supervisor for unassigned leads and escalations
                    <select
                      className="block min-h-11 w-full rounded border p-2"
                      value={settings.supervisorId ?? ''}
                      onChange={(e) =>
                        setSettings({ ...settings, supervisorId: e.target.value || null })
                      }
                    >
                      <option value="">Select supervisor</option>
                      {data.data.staff
                        .filter((s) => ['SUPER_ADMIN', 'CLINIC_MANAGER'].includes(s.role))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.firstName} {s.lastName}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      Reminder after working minutes
                      <Input
                        type="number"
                        min="1"
                        value={settings.reminderMinutes}
                        onChange={(e) =>
                          setSettings({ ...settings, reminderMinutes: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Escalation after additional working minutes
                      <Input
                        type="number"
                        min="1"
                        value={settings.escalationMinutes}
                        onChange={(e) =>
                          setSettings({ ...settings, escalationMinutes: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <label className="block">
                    Excluded stages (comma-separated)
                    <Input
                      value={settings.excludedStages.join(',')}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          excludedStages: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <Button
                    onClick={() =>
                      void apiRequest(
                        '/api/staff-alerts/settings',
                        { method: 'PATCH', body: JSON.stringify(settings) },
                        accessToken ?? undefined,
                      )
                        .then(() => {
                          setResult('Clinic settings saved');
                          void qc.invalidateQueries({ queryKey: ['notification-admin'] });
                        })
                        .catch((e) => setResult(e.message))
                    }
                  >
                    Save clinic settings
                  </Button>
                  {result && <p role="status">{result}</p>}
                </div>
              )}
              <label className="block">
                Staff profile
                <select
                  className="block min-h-11 w-full rounded border p-2"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Select employee</option>
                  {data.data.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </label>
              {staff && (
                <Preferences
                  key={staff.id}
                  staffId={staff.id}
                  phone={staff.notificationPhone}
                  initial={{ ...defaults, ...staff.notificationPreferences }}
                  admin
                />
              )}
              <h3 className="font-semibold">Recent delivery results</h3>
              <div className="space-y-2">
                {data.data.results.map((r) => (
                  <article className="rounded border p-3 text-sm" key={r.id}>
                    <p>
                      {data.data?.staff.find((s) => s.id === r.userId)?.firstName ?? 'Staff'} ·{' '}
                      {r.kind} · {r.channel} · <strong>{r.state}</strong>
                    </p>
                    <p>
                      {new Date(r.createdAt).toLocaleString()} · Attempts: {r.attempts}
                    </p>
                    {r.error && <p className="mt-1 text-destructive">{r.error}</p>}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
