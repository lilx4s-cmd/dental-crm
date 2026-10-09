'use client';

import { useState, useDeferredValue } from 'react';
import Link from 'next/link';
import {
  Search,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { CLINIC_TIMEZONE, type PatientView } from '@dental-crm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { NewPatientDialog } from '@/components/patients/new-patient-dialog';
import { QueryError } from '@/components/ui/query-state';
import { TagPill } from '@/components/tags/tag-pill';
import { usePatients, usePatientSummary, type Patient } from '@/hooks/use-patients';

const views = [
  { key: 'working', label: 'Working patients', count: 'working', icon: Users },
  { key: 'finished', label: 'Finished patients', count: 'finished', icon: CheckCircle2 },
  { key: 'reservations', label: 'Reservations', count: 'reservations', icon: CalendarDays },
] as const;
const dateLabel = (at: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at));
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00+03:00`));

function PatientRow({ patient: p }: { patient: Patient }) {
  const staff = p.convertedFromLead?.assignedTo;
  return (
    <article className="grid gap-4 border-b p-4 last:border-b-0 md:grid-cols-[1fr_1.1fr_1.4fr]">
      <div className="space-y-2">
        <Link
          className="text-base font-semibold text-primary hover:underline"
          href={`/patients/${p.id}`}
        >
          {p.firstName} {p.lastName}
        </Link>
        <div>
          <Badge variant={p.treatmentStatus === 'FINISHED' ? 'success' : 'info'}>
            {p.treatmentStatus === 'FINISHED' ? 'Finished' : 'Working'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          {p.tags.map(({ tag }) => (
            <TagPill key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <p>{p.phone ?? p.whatsappNumber ?? 'No phone recorded'}</p>
        {p.email && <p className="break-all text-muted-foreground">{p.email}</p>}
        <p className="text-muted-foreground">
          Responsible staff: {staff ? `${staff.firstName} ${staff.lastName}` : 'Unassigned'}
        </p>
        {p.treatmentFinishedAt && (
          <p className="text-muted-foreground">Finished {dateLabel(p.treatmentFinishedAt)}</p>
        )}
      </div>
      <div className="space-y-2 text-sm">
        {p.appointments?.map((a) => (
          <Link
            key={a.id}
            className="block rounded border bg-muted/30 p-2 hover:bg-muted"
            href={`/appointments?view=day&at=${encodeURIComponent(a.startTime)}`}
          >
            <span className="font-medium">Clinic appointment</span>
            <span className="block text-muted-foreground">{dateLabel(a.startTime)}</span>
          </Link>
        ))}
        {p.travelBookings?.map((b) => (
          <Link
            key={b.id}
            className="block rounded border bg-muted/30 p-2 hover:bg-muted"
            href={`/travel?bookingId=${b.id}`}
          >
            <span className="font-medium">Travel · Visit {b.visit}</span>
            {b.arrivalAt && (
              <span className="block text-muted-foreground">Arrival: {dateLabel(b.arrivalAt)}</span>
            )}
            {b.departureAt && (
              <span className="block text-muted-foreground">
                Departure: {dateLabel(b.departureAt)}
              </span>
            )}
          </Link>
        ))}
        {!p.appointments?.length && !p.travelBookings?.length && (
          <p className="text-muted-foreground">No upcoming dates recorded</p>
        )}
      </div>
    </article>
  );
}

export default function PatientsPage() {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [view, setView] = useState<PatientView>('working');
  const [month, setMonth] = useState('');
  const [staffId, setStaffId] = useState('');
  const [dueDays, setDueDays] = useState('');
  const [page, setPage] = useState(1);
  const filters = {
    search: deferredSearch || undefined,
    month: month || undefined,
    staffId: staffId || undefined,
    dueDays: dueDays ? Number(dueDays) : undefined,
  };
  const query = usePatients({ ...filters, view, page, limit: 20 });
  const summary = usePatientSummary(filters);
  const patients = query.data?.data ?? [];
  const meta = query.data?.meta;
  const selectView = (next: PatientView) => {
    setView(next);
    setPage(1);
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patients</h1>
          <p className="mt-1 text-muted-foreground">
            Track treatment, visits, and every upcoming patient date.
          </p>
        </div>
        <NewPatientDialog>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            New Patient
          </Button>
        </NewPatientDialog>
      </div>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Patient views">
        {views.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            aria-pressed={view === key}
            onClick={() => selectView(key)}
            className={`flex min-h-24 items-center gap-3 rounded-xl border p-4 text-start transition-colors ${view === key ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-muted/50'}`}
          >
            <Icon className="h-6 w-6 text-primary" />
            <span className="flex-1 font-medium">{label}</span>
            <span className="text-2xl font-semibold">
              {summary.isError ? '—' : (summary.data?.[count] ?? '…')}
            </span>
          </button>
        ))}
      </div>
      {summary.isError && (
        <QueryError error={summary.error} onRetry={summary.refetch} variant="inline" />
      )}
      <section className="space-y-2" aria-label="Reservation months">
        <h2 className="text-sm font-semibold">Months with reservations</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === 'reservations' && !month ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              selectView('reservations');
              setMonth('');
            }}
          >
            All upcoming reservations
          </Button>
          {summary.data?.months.map((m) => (
            <Button
              key={m.month}
              variant={month === m.month && view === 'reservations' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                selectView('reservations');
                setMonth(m.month);
              }}
            >
              {monthLabel(m.month)} <span className="ml-2 opacity-75">{m.count}</span>
            </Button>
          ))}
        </div>
        {summary.data && !summary.data.months.length && (
          <p className="text-sm text-muted-foreground">
            No upcoming reservations match these filters.
          </p>
        )}
      </section>
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block">Search patients</span>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name, email or phone…"
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>
          <label className="text-sm">
            <span className="mb-1 block">Month and year</span>
            <Input
              type="month"
              min="1970-01"
              max="2199-12"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block">Responsible staff</span>
            <select
              className="min-h-10 w-full rounded-md border bg-background p-2"
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All staff</option>
              {summary.data?.staffOptions.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block">Approaching dates</span>
            <select
              className="min-h-10 w-full rounded-md border bg-background p-2"
              value={dueDays}
              onChange={(e) => {
                setDueDays(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Any date</option>
              <option value="1">Next 24 hours</option>
              <option value="7">Next 7 days</option>
              <option value="30">Next 30 days</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Button
            variant={view === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => selectView('all')}
          >
            All patients
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setMonth('');
              setStaffId('');
              setDueDays('');
              setPage(1);
            }}
          >
            Clear filters
          </Button>
          <span className="text-muted-foreground">
            Dates shown in {CLINIC_TIMEZONE}. Each patient is counted once per month.
          </span>
        </div>
      </Card>
      <Card>
        <div className="border-b px-4 py-3 text-sm font-medium">
          {query.isError
            ? 'Patients not loaded'
            : meta
              ? `${meta.total} patients in this view`
              : 'Loading patients…'}
        </div>
        {query.isLoading ? (
          <div className="space-y-4 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton className="h-24 w-full" key={i} />
            ))}
          </div>
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={query.refetch} />
        ) : patients.length ? (
          patients.map((p) => <PatientRow patient={p} key={p.id} />)
        ) : (
          <p className="p-12 text-center text-muted-foreground">
            No patients match this view and its filters.
          </p>
        )}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-3">
            <p className="text-sm text-muted-foreground">
              Page {meta.page} of {meta.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Next page"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
