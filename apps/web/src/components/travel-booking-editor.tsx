'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { useUploadFile, useFiles, useFileDownload } from '@/hooks/use-files';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export interface Flight {
  local: string;
  timezone: string;
  offset: string;
  origin: string;
  destination: string;
  number: string;
}
export interface TravelDetails {
  patientId: string;
  leadId: string;
  visit: number;
  status: string;
  arrival: Flight | null;
  departure: Flight | null;
  detailsConfirmed: boolean;
  passengers: number;
  companions: string;
  treatmentPlanId: string | null;
  hotel: {
    name: string;
    room: string;
    checkIn: string | null;
    checkOut: string | null;
    nights: number;
  };
  readiness: Record<
    string,
    { state: string; reason: string; responsibleId: string | null; provider: string }
  >;
  notes: string;
}
export interface Booking {
  id: string;
  details: TravelDetails;
  revision: number;
  attachments?: { fileId: string; file?: { fileName: string } }[];
  sync?: { state: string; error: string | null };
  missing?: string[];
}
const blankFlight: Flight = {
  local: '',
  timezone: 'Europe/Istanbul',
  offset: '+03:00',
  origin: '',
  destination: '',
  number: '',
};
const checks: Record<string, string> = {
  arrivalTicket: 'Arrival ticket confirmed',
  returnFlight: 'Return flight recorded / not yet available',
  hotel: 'Hotel booked / not required',
  hotelDates: 'Hotel check-in / check-out confirmed',
  airportPickup: 'Airport pickup assigned',
  airportDeparture: 'Departure transfer assigned',
  clinicTransfers: 'Clinic transfers arranged',
  appointment: 'Treatment appointment arranged',
  coordinator: 'Responsible coordinator assigned',
};
export function TravelBookingEditor({
  patientId,
  leadId,
  booking,
  onSaved,
  plans = [],
  linkedTicketId,
}: {
  patientId: string;
  leadId: string;
  booking?: Booking;
  onSaved?: (booking?: Booking) => void;
  plans?: { id: string; title: string }[];
  linkedTicketId?: string;
}) {
  const { accessToken } = useAuth(),
    upload = useUploadFile(),
    files = useFiles('LEAD', leadId),
    download = useFileDownload();
  const [value, setValue] = useState<TravelDetails>(
      booking?.details ?? {
        patientId,
        leadId,
        visit: 1,
        status: 'DRAFT',
        arrival: null,
        departure: null,
        detailsConfirmed: false,
        passengers: 1,
        companions: '',
        treatmentPlanId: null,
        hotel: { name: '', room: '', checkIn: null, checkOut: null, nights: 0 },
        readiness: {},
        notes: '',
      },
    ),
    [saved, setSaved] = useState(booking),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (booking) {
      setValue(booking.details);
      setSaved(booking);
    }
  }, [booking]);
  const extraction = useQuery<
    {
      fileId: string;
      state: string;
      suggestions: {
        flights?: string[];
        routes?: string[];
        dates?: string[];
        times?: string[];
        note?: string;
      };
      error: string | null;
    }[]
  >({
    queryKey: ['ticket-extraction', saved?.id],
    queryFn: () =>
      apiRequest(`/api/travel/bookings/${saved?.id}/extraction`, {}, accessToken ?? undefined),
    enabled: !!saved && !!accessToken,
    refetchInterval: (query) =>
      query.state.data?.some((row) => ['QUEUED', 'PROCESSING'].includes(row.state)) ? 5000 : false,
  });
  const save = async () => {
    setBusy(true);
    try {
      const result = await apiRequest<Booking>(
        '/api/travel/bookings',
        {
          method: 'POST',
          body: JSON.stringify({ ...value, ...(saved ? { revision: saved.revision } : {}) }),
        },
        accessToken ?? undefined,
      );
      setSaved(result);
      setMessage('Booking saved. Calendar sync is queued separately.');
      onSaved?.(result);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const attach = async (fileId: string) => {
    if (!saved) return;
    await apiRequest(
      `/api/travel/bookings/${saved.id}/attachments`,
      { method: 'POST', body: JSON.stringify({ fileId }) },
      accessToken ?? undefined,
    );
    setMessage('Ticket attached to this visit. This does not create another booking.');
    onSaved?.(saved);
  };
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Flight ticket and travel visit</h2>
      <p className="text-sm text-muted-foreground">
        Use local flight times and the timezone of that airport. Confirm details from the ticket
        before calendar sync. Private documents stay in the CRM.
      </p>
      {!!plans.length && (
        <label className="block">
          Existing treatment plan
          <select
            className="min-h-11 w-full rounded border p-2"
            value={value.treatmentPlanId ?? ''}
            onChange={(e) => setValue({ ...value, treatmentPlanId: e.target.value || null })}
          >
            <option value="">Choose the treatment plan for this visit</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          Visit
          <select
            className="block min-h-11 w-full rounded border p-2"
            disabled={!!saved}
            value={value.visit}
            onChange={(e) => setValue({ ...value, visit: Number(e.target.value) })}
          >
            <option value="1">First treatment visit</option>
            <option value="2">Second treatment visit</option>
          </select>
        </label>
        <label>
          Booking status
          <select
            className="block min-h-11 w-full rounded border p-2"
            value={value.status}
            onChange={(e) => setValue({ ...value, status: e.target.value })}
          >
            {['DRAFT', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Passenger count
          <Input
            type="number"
            min="1"
            value={value.passengers}
            onChange={(e) => setValue({ ...value, passengers: Number(e.target.value) })}
          />
        </label>
      </div>
      {(['arrival', 'departure'] as const).map((kind) => (
        <fieldset className="space-y-3 rounded border p-3" key={kind}>
          <legend className="px-2 capitalize">{kind} flight</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={!!value[kind]}
              onChange={(e) =>
                setValue({
                  ...value,
                  [kind]: e.target.checked ? { ...blankFlight } : null,
                  detailsConfirmed: false,
                })
              }
            />
            {kind === 'departure' ? 'Return flight available' : 'Arrival flight available'}
          </label>
          {value[kind] && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(['local', 'timezone', 'offset', 'origin', 'destination', 'number'] as const).map(
                (key) => (
                  <label key={key}>
                    {key === 'local'
                      ? 'Airport local date and time'
                      : key === 'offset'
                        ? 'UTC offset for this date (e.g. +03:00)'
                        : key}
                    <Input
                      type={key === 'local' ? 'datetime-local' : 'text'}
                      value={value[kind]?.[key] ?? ''}
                      onChange={(e) =>
                        setValue({
                          ...value,
                          [kind]: {
                            ...value[kind]!,
                            [key]: ['origin', 'destination', 'number'].includes(key)
                              ? e.target.value.toUpperCase()
                              : e.target.value,
                          },
                          detailsConfirmed: false,
                        })
                      }
                    />
                  </label>
                ),
              )}
            </div>
          )}
        </fieldset>
      ))}
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={value.detailsConfirmed}
          onChange={(e) => setValue({ ...value, detailsConfirmed: e.target.checked })}
        />
        I checked the dates, airports, flight numbers and timezones against the ticket.
      </label>
      <label className="block">
        Companions / passenger details
        <Input
          value={value.companions}
          onChange={(e) => setValue({ ...value, companions: e.target.value })}
        />
      </label>
      <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2">
        <legend className="px-2">Hotel</legend>
        {(['name', 'room', 'checkIn', 'checkOut', 'nights'] as const).map((key) => (
          <label key={key}>
            {key}
            <Input
              type={
                key === 'nights'
                  ? 'number'
                  : key === 'checkIn' || key === 'checkOut'
                    ? 'date'
                    : 'text'
              }
              value={value.hotel[key] ?? ''}
              onChange={(e) => {
                const hotel = {
                  ...value.hotel,
                  [key]: key === 'nights' ? Number(e.target.value) : e.target.value || null,
                };
                if (hotel.checkIn && hotel.checkOut)
                  hotel.nights = Math.max(
                    0,
                    (Date.parse(hotel.checkOut) - Date.parse(hotel.checkIn)) / 86400000,
                  );
                setValue({ ...value, hotel });
              }}
            />
          </label>
        ))}
      </fieldset>
      <h3 className="font-semibold">Arrangements checklist</h3>
      {Object.entries(checks).map(([key, label]) => {
        const r = value.readiness[key] ?? {
          state: 'MISSING',
          reason: '',
          responsibleId: null,
          provider: '',
        };
        return (
          <div key={key} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
            <label>
              {label}
              <select
                className="block min-h-11 w-full rounded border p-2"
                value={r.state}
                onChange={(e) =>
                  setValue({
                    ...value,
                    readiness: { ...value.readiness, [key]: { ...r, state: e.target.value } },
                  })
                }
              >
                <option value="MISSING">Needs arrangement</option>
                <option value="READY">Confirmed / assigned</option>
                <option value="NOT_REQUIRED">Not required / not yet available (reason)</option>
              </select>
            </label>
            <label>
              Provider / responsible coordinator
              <Input
                value={r.provider}
                onChange={(e) =>
                  setValue({
                    ...value,
                    readiness: { ...value.readiness, [key]: { ...r, provider: e.target.value } },
                  })
                }
              />
            </label>
            {r.state === 'NOT_REQUIRED' && (
              <label className="sm:col-span-2">
                Reason
                <Input
                  value={r.reason}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      readiness: { ...value.readiness, [key]: { ...r, reason: e.target.value } },
                    })
                  }
                />
              </label>
            )}
          </div>
        );
      })}
      <label className="block">
        Operational notes
        <textarea
          className="min-h-24 w-full rounded border p-3"
          value={value.notes}
          onChange={(e) => setValue({ ...value, notes: e.target.value })}
        />
      </label>
      <Button disabled={busy} onClick={() => void save()}>
        Save travel booking
      </Button>
      {message && <p role="status">{message}</p>}
      {saved && (
        <div className="space-y-3 border-t pt-3">
          {linkedTicketId && (
            <Button
              variant="outline"
              onClick={() =>
                void attach(linkedTicketId).catch((error) => setMessage(error.message))
              }
            >
              Attach selected conversation ticket to this visit
            </Button>
          )}
          <label className="block">
            Upload flight ticket (PDF or image)
            <Input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={upload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void upload
                    .mutateAsync({ ownerType: 'LEAD', ownerId: leadId, category: 'OTHER', file })
                    .then((f) => attach(f.id))
                    .catch((error) => setMessage(error.message));
              }}
            />
          </label>
          <label className="block">
            Or attach an existing deal file
            <select
              className="block min-h-11 w-full rounded border p-2"
              value=""
              onChange={(e) =>
                void attach(e.target.value).catch((error) => setMessage(error.message))
              }
            >
              <option value="">Select ticket attachment</option>
              {files.data
                ?.filter((f) =>
                  ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(f.mimeType),
                )
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fileName}
                  </option>
                ))}
            </select>
          </label>
          {booking?.attachments?.map((a) => (
            <div key={a.fileId} className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void download(a.fileId).catch((error) => setMessage(error.message))}
              >
                Open {a.file?.fileName ?? 'ticket'}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void apiRequest(
                    `/api/travel/bookings/${saved.id}/extraction`,
                    { method: 'POST', body: JSON.stringify({ fileId: a.fileId }) },
                    accessToken ?? undefined,
                  )
                    .then(() => extraction.refetch())
                    .catch((error) => setMessage(error.message))
                }
              >
                Suggest flight details from PDF
              </Button>
            </div>
          ))}
          {extraction.data?.map((job) => (
            <article className="rounded border p-3 text-sm" key={job.fileId}>
              <strong>Ticket reading: {job.state}</strong>
              {job.error && <p>{job.error}</p>}
              {job.state === 'READY' && (
                <>
                  <p>Flights: {job.suggestions.flights?.join(', ')}</p>
                  <p>Routes: {job.suggestions.routes?.join(', ')}</p>
                  <p>
                    Dates: {job.suggestions.dates?.join(', ')} · Times:{' '}
                    {job.suggestions.times?.join(', ')}
                  </p>
                  <p>{job.suggestions.note}</p>
                </>
              )}
            </article>
          ))}
          {booking?.sync && (
            <p>
              Calendar: {booking.sync.state} {booking.sync.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
