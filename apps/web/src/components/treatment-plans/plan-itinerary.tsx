'use client';

import { Plane, Hotel, Car, CalendarDays } from 'lucide-react';
import { aftercareFor, conditionFromText, parseToothNumbers, type ToothCondition } from '@dental-crm/shared';

/**
 * Read-only view of a plan's travel, itinerary and aftercare. Shared by the staff dashboard and the
 * patient portal so both show what the printed dossier shows — a patient comparing the paper
 * against the link should not find them disagreeing.
 */
export interface ItineraryLike {
  stay?: {
    arrivalDate: string | null;
    arrivalFlight: string | null;
    departureDate: string | null;
    departureFlight: string | null;
    hotelName: string | null;
    hotelAddress: string | null;
    roomType: string | null;
    nights: number | null;
    companions: number | null;
    checkInDate: string | null;
    checkOutDate: string | null;
    airportTransfer: string | null;
    clinicTransfer: string | null;
    notes: string | null;
  } | null;
  scheduleItems?: Array<{
    id: string;
    date: string;
    time: string | null;
    title: string;
    location: string | null;
    notes: string | null;
    // Optional because the patient portal projects a narrower shape. Whether a line is booked is
    // the clinic's business — a patient reading their own itinerary should not be shown that the
    // clinic has not got round to reserving Wednesday yet.
    appointmentId?: string | null;
  }>;
  items: Array<{
    description: string;
    toothCondition: ToothCondition | null;
    treatmentCategory: { name: string } | null;
  }>;
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export function PlanStay({ stay }: { stay: ItineraryLike['stay'] }) {
  if (!stay) return null;
  const filled = Object.values(stay).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (!filled) return null;

  const arrival = [fmtDate(stay.arrivalDate), stay.arrivalFlight].filter(Boolean).join(' · ');
  const departure = [fmtDate(stay.departureDate), stay.departureFlight].filter(Boolean).join(' · ');

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Your stay</p>

      <div className="grid gap-3 sm:grid-cols-3">
        {(arrival || departure) && (
          <div className="rounded-md border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <Plane className="h-3.5 w-3.5 text-primary" /> Travel
            </p>
            <div className="space-y-2">
              <Row label="Arrival" value={arrival || null} />
              <Row label="Departure" value={departure || null} />
            </div>
          </div>
        )}

        {stay.hotelName && (
          <div className="rounded-md border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <Hotel className="h-3.5 w-3.5 text-primary" /> Hotel
            </p>
            <div className="space-y-2">
              <Row label="Hotel" value={stay.hotelName} />
              <Row label="Address" value={stay.hotelAddress} />
              <Row
                label="Room"
                value={
                  [stay.roomType, stay.nights ? `${stay.nights} nights` : null].filter(Boolean).join(' · ') || null
                }
              />
              <Row label="Travelling with" value={stay.companions ? `${stay.companions} companion(s)` : null} />
            </div>
          </div>
        )}

        {(stay.airportTransfer || stay.clinicTransfer) && (
          <div className="rounded-md border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <Car className="h-3.5 w-3.5 text-primary" /> Transport
            </p>
            <div className="space-y-2">
              <Row label="Airport" value={stay.airportTransfer} />
              <Row label="Clinic" value={stay.clinicTransfer} />
            </div>
          </div>
        )}
      </div>

      {stay.notes && <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">{stay.notes}</p>}
    </div>
  );
}

export function PlanSchedule({
  items,
  planId,
  patientId,
  onBook,
}: {
  items: ItineraryLike['scheduleItems'];
  /** Omitted on the patient portal, where the itinerary is read-only. */
  planId?: string;
  patientId?: string;
  onBook?: (item: NonNullable<ItineraryLike['scheduleItems']>[number]) => void;
}) {
  if (!items || items.length === 0) return null;
  const canBook = !!planId && !!patientId && !!onBook;

  // Group by day so each date is announced once, the way the printed itinerary reads.
  const days = new Map<string, typeof items>();
  for (const item of [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
    const key = fmtDate(item.date) ?? item.date;
    days.set(key, [...(days.get(key) ?? []), item]);
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" /> Your schedule
      </p>
      <div className="overflow-hidden rounded-md border">
        {[...days.entries()].map(([day, entries]) => (
          <div key={day} className="border-b last:border-b-0">
            <p className="bg-muted/50 px-3 py-1.5 text-xs font-semibold">{day}</p>
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 border-t px-3 py-2 text-sm first:border-t-0">
                <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{e.time ?? ''}</span>
                <span className="min-w-0 flex-1">
                  {e.title}
                  {e.notes && <span className="text-muted-foreground"> — {e.notes}</span>}
                </span>
                {e.location && <span className="shrink-0 text-muted-foreground">{e.location}</span>}
                {/* Whether the diary actually holds this day. The dossier promises the patient a
                    date; until somebody books it, nothing in the calendar knows. */}
                {canBook &&
                  (e.appointmentId ? (
                    <span className="shrink-0 text-xs text-success">Booked</span>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-primary hover:underline"
                      onClick={() => onBook?.(e)}
                    >
                      Book
                    </button>
                  ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Aftercare for the procedures in this plan only. */
export function PlanAftercare({ items }: { items: ItineraryLike['items'] }) {
  const conditions = new Set<ToothCondition>();
  for (const item of items) {
    const c = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
    if (c) conditions.add(c);
  }
  const sections = aftercareFor(conditions);
  if (sections.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Your treatment, explained</p>
      {sections.map((s) => (
        <div key={s.condition} className="rounded-md border p-3">
          <p className="text-sm font-semibold">{s.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{s.whatToExpect}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
            {s.aftercare.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          {s.warningSigns && (
            <div className="mt-3 rounded-md border border-destructive/25 bg-destructive-muted p-2">
              <p className="text-xs font-semibold text-destructive-muted-foreground">
                Contact the clinic if you notice
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                {s.warningSigns.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export { parseToothNumbers };
