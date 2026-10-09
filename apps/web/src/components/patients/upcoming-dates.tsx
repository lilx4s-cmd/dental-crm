'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CLINIC_TIMEZONE } from '@dental-crm/shared';
import { useAppointments } from '@/hooks/use-appointments';
import { usePatientSchedule } from '@/hooks/use-patient-schedule';
import { QueryError } from '@/components/ui/query-state';
export function UpcomingPatientDates() {
  const [from] = useState(() => new Date().toISOString());
  const to = new Date(new Date(from).getTime() + 7 * 86400000).toISOString();
  const appointments = useAppointments(from, to);
  const travel = usePatientSchedule(from, to);
  const dates = [
    ...(appointments.data ?? [])
      .filter((a) => ['SCHEDULED', 'CONFIRMED'].includes(a.status))
      .map((a) => ({
        id: a.id,
        name: `${a.patient.firstName} ${a.patient.lastName}`,
        label: 'Clinic appointment',
        at: a.startTime,
        path: `/appointments?view=day&at=${encodeURIComponent(a.startTime)}`,
      })),
    ...(travel.data ?? []).map((f) => ({
      id: f.id,
      name: f.patientName,
      label: f.kind === 'ARRIVAL' ? 'Patient arrival' : 'Return flight',
      at: f.startTime,
      path: `/travel?bookingId=${f.bookingId}`,
    })),
  ]
    .filter((e) => new Date(e.at) > new Date())
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 6);
  return (
    <section className="rounded-lg border p-3" aria-label="Approaching patient dates">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Coming in the next 7 days</h2>
        <span className="text-xs text-muted-foreground">{CLINIC_TIMEZONE}</span>
      </div>
      {appointments.isLoading || travel.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading upcoming dates…</p>
      ) : appointments.isError || travel.isError ? (
        <QueryError
          error={appointments.error ?? travel.error}
          onRetry={() => {
            void appointments.refetch();
            void travel.refetch();
          }}
          variant="inline"
        />
      ) : dates.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dates.map((d) => (
            <Link
              key={d.id}
              className="rounded-md bg-muted/40 p-2 text-sm hover:bg-muted"
              href={d.path}
            >
              <span className="block font-medium">
                {d.name} · {d.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat('en-GB', {
                  timeZone: CLINIC_TIMEZONE,
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(d.at))}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No scheduled patient dates in the next 7 days.
        </p>
      )}
    </section>
  );
}
