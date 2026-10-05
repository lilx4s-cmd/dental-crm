'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Booking, TravelBookingEditor } from '@/components/travel-booking-editor';
interface Row extends Booking {
  patientId: string;
  leadId: string;
  visit: number;
  status: string;
  arrivalAt: string | null;
  departureAt: string | null;
  lead: {
    firstName: string;
    lastName: string | null;
    assignedToId: string | null;
    assignedTo: { firstName: string; lastName: string } | null;
  };
}
interface Panel {
  data: Row[];
  page: number;
  total: number;
  counts: { status: string; _count: number }[];
  uniqueBookedPatients: number;
  countDefinition: string;
  staffOptions: { id: string; firstName: string; lastName: string }[];
}
export default function TravelPage() {
  const { accessToken } = useAuth();
  const [month, setMonth] = useState(() =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
      }).format(new Date()),
    ),
    [visit, setVisit] = useState(''),
    [status, setStatus] = useState(''),
    [staffId, setStaffId] = useState(''),
    [page, setPage] = useState(1),
    [id, setId] = useState(''),
    [leadId, setLeadId] = useState('');
  const [linkedTicketId, setLinkedTicketId] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setId(q.get('bookingId') ?? '');
    setLeadId(q.get('leadId') ?? '');
    setLinkedTicketId(q.get('fileId') ?? '');
  }, []);
  const panel = useQuery<Panel>({
    queryKey: ['travel', month, visit, status, staffId, page],
    queryFn: () =>
      apiRequest(
        '/api/travel?' + new URLSearchParams({ month, visit, status, staffId, page: String(page) }),
        {},
        accessToken ?? undefined,
      ),
    enabled: !!accessToken,
  });
  const booking = useQuery<Booking>({
    queryKey: ['travel-booking', id],
    queryFn: () => apiRequest(`/api/travel/bookings/${id}`, {}, accessToken ?? undefined),
    enabled: !!accessToken && !!id,
  });
  const caseLeadId = leadId || booking.data?.details.leadId || '';
  const lead = useQuery<{
    id: string;
    patient: { id: string; treatmentPlans: { id: string; title: string }[] } | null;
    firstName: string;
    bookings: { id: string; visit: number; status: string }[];
  }>({
    queryKey: ['travel-lead', caseLeadId],
    queryFn: () => apiRequest(`/api/travel/case/${caseLeadId}`, {}, accessToken ?? undefined),
    enabled: !!caseLeadId && !!accessToken,
  });
  const reload = (saved?: Booking) => {
    if (saved) setId(saved.id);
    void panel.refetch();
    if (caseLeadId) void lead.refetch();
    if (id) void booking.refetch();
  };
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold">Patient travel</h1>
      <p>
        Operational times below use Istanbul time. A return flight and repeated uploads belong to
        the same treatment visit.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          Arrival month
          <Input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Visit
          <select
            className="block min-h-11 w-full rounded border p-2"
            value={visit}
            onChange={(e) => {
              setVisit(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Both visits</option>
            <option value="1">First visit</option>
            <option value="2">Second visit</option>
          </select>
        </label>
        <label>
          Status
          <select
            className="block min-h-11 w-full rounded border p-2"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {['DRAFT', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {!!panel.data?.staffOptions.length && (
        <label className="block">
          Salesperson
          <select
            className="min-h-11 w-full rounded border p-2"
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Whole authorized team</option>
            {panel.data.staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </label>
      )}
      {panel.isError && <p role="alert">{panel.error.message}</p>}
      {panel.data && (
        <>
          <p>
            <strong>{panel.data.uniqueBookedPatients}</strong> unique booked patients ·{' '}
            {panel.data.counts
              .filter((c) => ['CONFIRMED', 'ARRIVED', 'COMPLETED'].includes(c.status))
              .reduce((n, c) => n + c._count, 0)}{' '}
            confirmed treatment visits ·{' '}
            {panel.data.counts.find((c) => c.status === 'CANCELLED')?._count ?? 0} cancelled
          </p>
          <p className="text-sm text-muted-foreground">{panel.data.countDefinition}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {panel.data.data.map((b) => (
              <article className="space-y-2 rounded-xl border p-4" key={b.id}>
                <h2 className="font-semibold">
                  {b.lead.firstName} {b.lead.lastName} · Visit {b.visit}
                </h2>
                <p>
                  {b.status} · {b.lead.assignedTo?.firstName ?? 'Unassigned'}
                </p>
                <p>
                  Arrival:{' '}
                  {b.arrivalAt
                    ? new Date(b.arrivalAt).toLocaleString(undefined, {
                        timeZone: 'Europe/Istanbul',
                      })
                    : 'Missing'}
                </p>
                <p>
                  Departure:{' '}
                  {b.departureAt
                    ? new Date(b.departureAt).toLocaleString(undefined, {
                        timeZone: 'Europe/Istanbul',
                      })
                    : 'Not available'}
                </p>
                <p>Calendar: {b.sync?.state ?? 'Pending'}</p>
                {!!b.missing?.length && (
                  <p className="text-amber-700">Needs action: {b.missing.join(', ')}</p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => {
                      setId(b.id);
                      setLeadId('');
                    }}
                  >
                    Open booking / ticket
                  </Button>
                  <Link
                    className="inline-flex min-h-11 items-center underline"
                    href={`/pipeline?leadId=${b.leadId}`}
                  >
                    Deal
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center underline"
                    href={`/patients/${b.patientId}`}
                  >
                    Patient
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="outline"
              disabled={page * 30 >= panel.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {booking.isError && <p role="alert">{booking.error.message}</p>}
      {lead.isError && <p role="alert">{lead.error.message}</p>}
      {booking.data && (
        <>
          <TravelBookingEditor
            key={booking.data.id}
            patientId={booking.data.details.patientId}
            leadId={booking.data.details.leadId}
            booking={booking.data}
            plans={lead.data?.patient?.treatmentPlans ?? []}
            linkedTicketId={linkedTicketId}
            onSaved={reload}
          />
          <Button
            variant="outline"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              setRetryMessage('');
              void apiRequest(
                `/api/travel/bookings/${id}/retry`,
                { method: 'POST' },
                accessToken ?? undefined,
              )
                .then(() => {
                  setRetryMessage('Calendar sync queued for retry.');
                  reload();
                })
                .catch((error) => setRetryMessage(error.message))
                .finally(() => setRetrying(false));
            }}
          >
            Retry calendar sync
          </Button>
          {retryMessage && <p role="status">{retryMessage}</p>}
        </>
      )}
      {lead.data?.patient && !id && (
        <>
          {lead.data.bookings.map((b) => (
            <Button key={b.id} variant="outline" onClick={() => setId(b.id)}>
              Open visit {b.visit} · {b.status}
            </Button>
          ))}
          <TravelBookingEditor
            key={lead.data.id}
            patientId={lead.data.patient.id}
            leadId={lead.data.id}
            plans={lead.data.patient.treatmentPlans}
            linkedTicketId={linkedTicketId}
            onSaved={reload}
          />
        </>
      )}{' '}
      {lead.data && !lead.data.patient && (
        <p>Convert this existing deal to its patient before recording a travel visit.</p>
      )}
      <Earnings month={month} />
    </div>
  );
}
function Earnings({ month }: { month: string }) {
  const { accessToken } = useAuth();
  const result = useQuery<{
    commissions: {
      id: string;
      amount: string;
      currency: string;
      state: string;
      calculation: { basis: string; percentage: string };
    }[];
    salaries: { id: string; amount: string; currency: string; status: string }[];
  }>({
    queryKey: ['earnings', month],
    queryFn: () => apiRequest('/api/travel/earnings?month=' + month, {}, accessToken ?? undefined),
    enabled: !!accessToken,
  });
  return (
    <section className="space-y-3 border-t pt-4">
      <h2 className="text-xl font-semibold">My monthly earnings</h2>
      {result.isError && <p role="alert">{result.error.message}</p>}
      {result.data?.salaries.map((s) => (
        <p key={s.id}>
          Salary {s.amount} {s.currency} · {s.status}
        </p>
      ))}
      {result.data?.commissions.map((c) => (
        <article className="rounded border p-3" key={c.id}>
          {c.amount} {c.currency} · {c.state}
          <p className="text-sm">
            Basis {c.calculation.basis} · Rate {c.calculation.percentage}%
          </p>
        </article>
      ))}
      {result.data && !result.data.commissions.length && (
        <p>
          No calculated commissions. An administrator must define compensation and case eligibility.
        </p>
      )}
    </section>
  );
}
