'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface StayForm {
  arrivalDate: string;
  arrivalFlight: string;
  departureDate: string;
  departureFlight: string;
  hotelName: string;
  hotelAddress: string;
  roomType: string;
  nights: string;
  companions: string;
  checkInDate: string;
  checkOutDate: string;
  airportTransfer: string;
  clinicTransfer: string;
  notes: string;
}

export interface ScheduleItemForm {
  date: string;
  time: string;
  title: string;
  location: string;
  notes: string;
}

export const EMPTY_STAY: StayForm = {
  arrivalDate: '',
  arrivalFlight: '',
  departureDate: '',
  departureFlight: '',
  hotelName: '',
  hotelAddress: '',
  roomType: '',
  nights: '',
  companions: '',
  checkInDate: '',
  checkOutDate: '',
  airportTransfer: '',
  clinicTransfer: '',
  notes: '',
};

export const EMPTY_SCHEDULE_ITEM: ScheduleItemForm = { date: '', time: '', title: '', location: '', notes: '' };

/** A bare date input gives a day with no time; midday keeps a timezone shift from moving it. */
function toIso(date: string): string | undefined {
  return date ? new Date(`${date}T12:00:00`).toISOString() : undefined;
}

/** Only send a stay when something was actually filled in, so an untouched tab stores nothing. */
export function stayPayload(stay: StayForm) {
  const filled = Object.values(stay).some((v) => v.trim() !== '');
  if (!filled) return undefined;
  const text = (v: string) => (v.trim() ? v.trim() : undefined);
  const int = (v: string) => (v.trim() ? parseInt(v, 10) : undefined);
  return {
    arrivalDate: toIso(stay.arrivalDate),
    arrivalFlight: text(stay.arrivalFlight),
    departureDate: toIso(stay.departureDate),
    departureFlight: text(stay.departureFlight),
    hotelName: text(stay.hotelName),
    hotelAddress: text(stay.hotelAddress),
    roomType: text(stay.roomType),
    nights: int(stay.nights),
    companions: int(stay.companions),
    checkInDate: toIso(stay.checkInDate),
    checkOutDate: toIso(stay.checkOutDate),
    airportTransfer: text(stay.airportTransfer),
    clinicTransfer: text(stay.clinicTransfer),
    notes: text(stay.notes),
  };
}

/** A schedule entry is meaningless without both a day and something happening on it. */
export function schedulePayload(items: ScheduleItemForm[]) {
  const usable = items.filter((i) => i.date && i.title.trim());
  if (usable.length === 0) return undefined;
  return usable.map((i) => ({
    date: toIso(i.date)!,
    time: i.time.trim() || undefined,
    title: i.title.trim(),
    location: i.location.trim() || undefined,
    notes: i.notes.trim() || undefined,
  }));
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function StayScheduleEditor({
  stay,
  schedule,
  onStayChange,
  onScheduleChange,
}: {
  stay: StayForm;
  schedule: ScheduleItemForm[];
  onStayChange: (next: StayForm) => void;
  onScheduleChange: (next: ScheduleItemForm[]) => void;
}) {
  const set = (patch: Partial<StayForm>) => onStayChange({ ...stay, ...patch });
  const setItem = (idx: number, patch: Partial<ScheduleItemForm>) =>
    onScheduleChange(schedule.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-semibold">Travel</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Arrival date">
            <Input className="h-9" type="date" value={stay.arrivalDate} onChange={(e) => set({ arrivalDate: e.target.value })} />
          </Field>
          <Field label="Arrival flight">
            <Input className="h-9" placeholder="AF1390" value={stay.arrivalFlight} onChange={(e) => set({ arrivalFlight: e.target.value })} />
          </Field>
          <Field label="Departure date">
            <Input className="h-9" type="date" value={stay.departureDate} onChange={(e) => set({ departureDate: e.target.value })} />
          </Field>
          <Field label="Departure flight">
            <Input className="h-9" placeholder="AF1391" value={stay.departureFlight} onChange={(e) => set({ departureFlight: e.target.value })} />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Accommodation</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Hotel">
            <Input className="h-9" value={stay.hotelName} onChange={(e) => set({ hotelName: e.target.value })} />
          </Field>
          <Field label="Room type">
            <Input className="h-9" placeholder="Deluxe double" value={stay.roomType} onChange={(e) => set({ roomType: e.target.value })} />
          </Field>
          <Field label="Nights">
            <Input className="h-9" type="number" min="0" value={stay.nights} onChange={(e) => set({ nights: e.target.value })} />
          </Field>
          <Field label="Companions">
            <Input className="h-9" type="number" min="0" value={stay.companions} onChange={(e) => set({ companions: e.target.value })} />
          </Field>
          <div className="col-span-2 sm:col-span-4">
            <Field label="Hotel address">
              <Input className="h-9" value={stay.hotelAddress} onChange={(e) => set({ hotelAddress: e.target.value })} />
            </Field>
          </div>
          <Field label="Check-in">
            <Input className="h-9" type="date" value={stay.checkInDate} onChange={(e) => set({ checkInDate: e.target.value })} />
          </Field>
          <Field label="Check-out">
            <Input className="h-9" type="date" value={stay.checkOutDate} onChange={(e) => set({ checkOutDate: e.target.value })} />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Transport</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Airport transfer">
            <Input className="h-9" placeholder="VIP car, meets you in arrivals" value={stay.airportTransfer} onChange={(e) => set({ airportTransfer: e.target.value })} />
          </Field>
          <Field label="Clinic transfer">
            <Input className="h-9" placeholder="Hotel to clinic each morning at 08:30" value={stay.clinicTransfer} onChange={(e) => set({ clinicTransfer: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Notes for the patient">
            <Textarea rows={2} value={stay.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Breakfast included, late check-out arranged…" />
          </Field>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Day-by-day schedule</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onScheduleChange([...schedule, { ...EMPTY_SCHEDULE_ITEM }])}
          >
            <Plus className="mr-1 h-3 w-3" /> Add day
          </Button>
        </div>

        {schedule.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No schedule yet. Add the appointments the patient should expect on each day of their visit.
          </p>
        ) : (
          <div className="space-y-2">
            {schedule.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 rounded-md border p-2">
                <Input className="col-span-3 h-8 text-xs" type="date" value={item.date} onChange={(e) => setItem(i, { date: e.target.value })} />
                <Input className="col-span-2 h-8 text-xs" placeholder="09:30" value={item.time} onChange={(e) => setItem(i, { time: e.target.value })} />
                <Input className="col-span-4 h-8 text-xs" placeholder="What happens" value={item.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                <Input className="col-span-2 h-8 text-xs" placeholder="Where" value={item.location} onChange={(e) => setItem(i, { location: e.target.value })} />
                <button
                  type="button"
                  aria-label="Remove day"
                  className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-destructive"
                  onClick={() => onScheduleChange(schedule.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
