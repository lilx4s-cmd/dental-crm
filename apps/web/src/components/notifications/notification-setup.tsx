'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
export interface NotificationStatus {
  notificationPhone: string | null;
  preferences: {
    push: boolean;
    whatsapp: boolean;
    language: string;
    optIn: boolean;
    timezone: string;
    days: number[];
    start: number;
    end: number;
  };
  push: { configured: boolean; publicKey: string | null };
  deviceCount: number;
}
export function NotificationSetup({ always = false }: { always?: boolean }) {
  const { user, accessToken } = useAuth();
  const [state, setState] = useState('loading'),
    [visible, setVisible] = useState(always),
    [ios, setIos] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const status = useQuery<NotificationStatus>({
    queryKey: ['notification-status', user?.sub],
    queryFn: () => apiRequest('/api/staff-alerts/me', {}, accessToken ?? undefined),
    enabled: !!user,
  });
  useEffect(() => {
    if (!user) return;
    const apple =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIos(apple);
    setVisible(
      always ||
        (window.matchMedia('(max-width: 767px)').matches &&
          localStorage.getItem('notification-later-' + user.sub) !== 'yes'),
    );
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    const check = async () => {
      if (apple && !installed) {
        setState('install');
        return;
      }
      if (
        !('Notification' in window) ||
        !('PushManager' in window) ||
        !('serviceWorker' in navigator)
      ) {
        setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const device = subscription
        ? await apiRequest<{ saved: boolean }>(
            '/api/staff-alerts/devices/check',
            { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) },
            accessToken ?? undefined,
          )
        : null;
      setState(
        Notification.permission === 'granted' && device?.saved && status.data?.preferences.push
          ? 'enabled'
          : 'ready',
      );
    };
    void check().catch(() => setState('unsupported'));
  }, [user, always, status.data?.deviceCount, status.data?.preferences.push]);
  const enable = async () => {
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'ready');
        return;
      }
      if (!status.data?.push.configured || !status.data.push.publicKey)
        throw new Error('Your administrator must configure CRM push notifications first.');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const key = Uint8Array.from(
          atob(status.data.push.publicKey.replace(/-/g, '+').replace(/_/g, '/')),
          (c) => c.charCodeAt(0),
        );
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }
      const result = await apiRequest<{ saved: boolean }>(
        '/api/staff-alerts/devices',
        { method: 'POST', body: JSON.stringify(subscription.toJSON()) },
        accessToken ?? undefined,
      );
      if (!result.saved) throw new Error('Device registration was not saved.');
      setState('enabled');
      await status.refetch();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to enable notifications.');
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      const result = await apiRequest<{ state: string; error?: string }>(
        '/api/staff-alerts/test-push',
        { method: 'POST' },
        accessToken ?? undefined,
      );
      setMessage(
        result.state === 'ACCEPTED'
          ? 'Test accepted by the push service. Check your phone for the notification.'
          : (result.error ?? result.state),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Test failed.');
    } finally {
      setBusy(false);
    }
  };
  if (!visible || !user) return null;
  return (
    <section
      className="rounded-xl border bg-background p-4 space-y-3"
      aria-label="Mobile notifications"
    >
      <h2 className="font-semibold">Phone notifications</h2>
      <p>Enable notifications to receive new lead alerts and follow-up reminders on your phone.</p>
      {state === 'install' && (
        <p>
          Open in Safari → Share → Add to Home Screen → Open the CRM icon. Then enable notifications
          here.
        </p>
      )}
      {!ios && (
        <p className="text-sm text-muted-foreground">
          Samsung: browser menu → Install app or Add to Home Screen. Installation is optional for
          supported browser notifications.
        </p>
      )}
      {state === 'enabled' && <p role="status">Notifications enabled.</p>}
      {state === 'denied' && (
        <p>
          Notifications are blocked. Allow them in your browser’s site settings or your phone’s
          notification settings, then return here.
        </p>
      )}
      {state === 'unsupported' && (
        <p>
          This browser does not support CRM push notifications. Use a supported browser or ask your
          administrator to configure your separate WhatsApp alerts.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {state === 'ready' && (
          <Button onClick={() => void enable()} disabled={busy || !status.data?.push.configured}>
            Enable notifications
          </Button>
        )}
        {state === 'ready' && status.data && !status.data.push.configured && (
          <p className="text-sm">Administrator setup required: VAPID push keys.</p>
        )}
        {state === 'enabled' && (
          <Button onClick={() => void test()} disabled={busy}>
            Send a test notification
          </Button>
        )}
        {!always && (
          <Button
            variant="outline"
            onClick={() => {
              localStorage.setItem('notification-later-' + user.sub, 'yes');
              setVisible(false);
            }}
          >
            Later
          </Button>
        )}
        <Link className="inline-flex min-h-11 items-center text-sm underline" href="/notifications">
          Notification settings
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        CRM push permission is separate from WhatsApp alerts. Delivery depends on phone settings,
        internet and connection availability.
      </p>
    </section>
  );
}
