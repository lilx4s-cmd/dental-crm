'use client';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useStaffNotifications, useReadNotification } from '@/hooks/use-patient-schedule';
import { QueryError } from '@/components/ui/query-state';
import { Button } from '@/components/ui/button';
export function NotificationBell() {
  const notifications = useStaffNotifications();
  const count = notifications.data?.unread;
  return (
    <Link
      href="/notifications"
      aria-label={
        notifications.isError
          ? 'Notifications unavailable'
          : `Notifications${count ? `, ${count} unread` : ''}`
      }
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted"
    >
      <Bell className="h-5 w-5" />
      {notifications.isError ? (
        <span className="absolute right-0 top-0 rounded-full bg-warning-muted px-1 text-xs">!</span>
      ) : (
        !!count && (
          <span className="absolute right-0 top-0 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )
      )}
    </Link>
  );
}
export function NotificationInbox() {
  const query = useStaffNotifications();
  const read = useReadNotification();
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-label="Notification inbox">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Your reminders</h2>
        {query.data && (
          <span className="text-sm text-muted-foreground">{query.data.unread} unread</span>
        )}
      </div>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading reminders…</p>
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : !query.data?.data.length ? (
        <p className="text-sm text-muted-foreground">
          No reminders yet. Upcoming patient appointments and flights will appear here.
        </p>
      ) : (
        <div className="space-y-2">
          {query.data.data.map((n) => (
            <article
              key={n.id}
              className={`rounded-lg border p-3 ${n.readAt ? '' : 'border-primary/40 bg-primary/5'}`}
            >
              <Link
                href={n.path}
                onClick={() => {
                  if (!n.readAt) read.mutate(n.id);
                }}
                className="font-medium text-primary hover:underline"
              >
                {n.title}
              </Link>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">
                {n.body
                  .replace(/https?:\/\/\S+$/, '')
                  .replace(/Open the booking:\s*$/, '')
                  .trim()}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <time className="text-xs text-muted-foreground" dateTime={n.createdAt}>
                  {new Date(n.createdAt).toLocaleString()}
                </time>
                {!n.readAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={read.isPending}
                    onClick={() => read.mutate(n.id)}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {read.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not mark the reminder as read. Try again.
        </p>
      )}
    </section>
  );
}
