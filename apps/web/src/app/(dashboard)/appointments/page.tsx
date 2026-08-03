'use client';

import 'react-big-calendar/lib/css/react-big-calendar.css';
// Loaded after the library's own stylesheet so it can override it.
import './google-calendar.css';

import { useState, useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
  isSameDay,
  isSameMonth,
} from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { APPOINTMENT_WRITE } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useAppointments, useCreateAppointment, useUpdateAppointment, type Appointment } from '@/hooks/use-appointments';
import { usePatients } from '@/hooks/use-patients';
import { useDentists } from '@/hooks/use-users';
import { QueryError } from '@/components/ui/query-state';

// ─── date-fns localizer ────────────────────────────────────────────────────
const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

// ─── Constants ─────────────────────────────────────────────────────────────
const APPOINTMENT_TYPES = [
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'TREATMENT', label: 'Treatment' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-info-muted text-info-muted-foreground',
  CONFIRMED: 'bg-success-muted text-success-muted-foreground',
  IN_PROGRESS: 'bg-warning-muted text-warning-muted-foreground',
  COMPLETED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-destructive-muted text-destructive-muted-foreground',
  NO_SHOW: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

// Google Calendar's own default event blue, for appointments with no dentist to colour them.
const DEFAULT_EVENT_COLOR = '#039be5';

/** Where the time grid opens. The clinic's day starts long after midnight. */
const SCROLL_TO = new Date(1970, 0, 1, 8, 0, 0);

const CALENDAR_FORMATS = {
  // "9 AM", not "09:00 AM" — Google drops the minutes when an hour label lands on the hour.
  timeGutterFormat: 'h a',
  // The end carries the meridiem for the pair, so a block reads "9:00 – 9:30 AM".
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'h:mm')} – ${format(end, 'h:mm a')}`,
  agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`,
};

// A cancelled slot still has to be visible — it is the reason the chair is free — but it must not
// read as a booking. Google's convention is a faded, struck-through entry.
const CANCELLED_OPACITY = 0.45;

// ─── Calendar event style ────────────────────────────────────────────────────
// Shape and spacing live in google-calendar.css; only the per-appointment colour is decided here.
function eventStyleGetter(event: { resource?: Appointment }) {
  const appt = event.resource;
  const color = appt?.dentist?.calendarColor ?? DEFAULT_EVENT_COLOR;
  const cancelled = appt?.status === 'CANCELLED';
  return {
    style: {
      backgroundColor: color,
      color: '#fff',
      opacity: cancelled ? CANCELLED_OPACITY : 1,
      textDecoration: cancelled ? 'line-through' : undefined,
    },
  };
}

/** Google's two-line column head: the weekday above the date, today's date in a filled blue disc. */
function GoogleDayHeader({ date }: { date: Date }) {
  const today = isSameDay(date, new Date());
  return (
    <div className="flex flex-col items-center gap-0.5 py-1">
      <span
        className="text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: today ? 'var(--gc-blue)' : 'var(--gc-text-muted)' }}
      >
        {format(date, 'EEE')}
      </span>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] font-normal leading-none"
        style={
          today
            ? { background: 'var(--gc-blue)', color: 'var(--gc-blue-fg)' }
            : { color: 'var(--gc-text)' }
        }
      >
        {format(date, 'd')}
      </span>
    </div>
  );
}

/** The corner above the hour gutter, where Google prints the viewer's UTC offset. */
function TimezoneCorner() {
  // getTimezoneOffset counts minutes *behind* UTC, so the sign is inverted for display.
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const label = abs % 60 === 0 ? `${sign}${Math.floor(abs / 60)}` : `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
  return (
    <div className="flex h-full items-end justify-end pb-1 pr-2 text-[10px]" style={{ color: 'var(--gc-text-muted)' }}>
      GMT{label}
    </div>
  );
}

/** How Google titles each view: "July 2026", "21 – 27 Jul 2026", "Monday, 27 July 2026". */
function rangeTitle(date: Date, view: View): string {
  if (view === Views.MONTH) return format(date, 'MMMM yyyy');
  if (view === Views.DAY) return format(date, 'EEEE, d MMMM yyyy');
  const from = startOfWeek(date, { locale: enUS });
  const to = endOfWeek(date, { locale: enUS });
  if (isSameMonth(from, to)) return `${format(from, 'd')} – ${format(to, 'd MMM yyyy')}`;
  return `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`;
}

// ─── Appointment detail dialog ───────────────────────────────────────────────
function AppointmentDetailDialog({
  appointment,
  onClose,
}: {
  appointment: Appointment | null;
  onClose: () => void;
}) {
  const update = useUpdateAppointment(appointment?.id ?? '');
  const { user } = useAuth();
  // Same rule as the Create button: reading the diary and changing it are different rights.
  const mayBook = (APPOINTMENT_WRITE as readonly string[]).includes(user?.role ?? '');

  if (!appointment) return null;

  const handleStatus = (status: string) => {
    update.mutate(
      { status },
      {
        onSuccess: () => { toast.success('Status updated'); onClose(); },
        onError: () => toast.error('Failed to update'),
      }
    );
  };

  return (
    <Dialog open={!!appointment} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {appointment.patient.firstName} {appointment.patient.lastName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Type</span>
            <span className="font-medium">
              {APPOINTMENT_TYPES.find((t) => t.value === appointment.type)?.label ?? appointment.type}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge className={STATUS_COLORS[appointment.status] ?? ''} variant="outline">
              {appointment.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Start</span>
            <span>{format(new Date(appointment.startTime), 'PPp')}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">End</span>
            <span>{format(new Date(appointment.endTime), 'PPp')}</span>
          </div>
          {appointment.dentist && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Dentist</span>
              <span>Dr. {appointment.dentist.firstName} {appointment.dentist.lastName}</span>
            </div>
          )}
          {appointment.patient.phone && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{appointment.patient.phone}</span>
            </div>
          )}
          {appointment.notes && (
            <div>
              <p className="text-muted-foreground mb-1">Notes</p>
              <p className="text-sm bg-muted rounded p-2">{appointment.notes}</p>
            </div>
          )}
        </div>

        {mayBook && appointment.status !== 'CANCELLED' && appointment.status !== 'COMPLETED' && (
          <DialogFooter className="flex-wrap gap-2">
            {appointment.status === 'SCHEDULED' && (
              <Button size="sm" variant="outline" onClick={() => handleStatus('CONFIRMED')} disabled={update.isPending}>
                Confirm
              </Button>
            )}
            {appointment.status === 'CONFIRMED' && (
              <Button size="sm" variant="outline" onClick={() => handleStatus('IN_PROGRESS')} disabled={update.isPending}>
                Start
              </Button>
            )}
            {appointment.status === 'IN_PROGRESS' && (
              <Button size="sm" onClick={() => handleStatus('COMPLETED')} disabled={update.isPending}>
                Complete
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleStatus('CANCELLED')}
              disabled={update.isPending}
            >
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── New Appointment Dialog ──────────────────────────────────────────────────
/** Radix Select reserves '' for "no selection", so "unassigned" needs a value of its own. */
const UNASSIGNED = '__unassigned__';

function NewAppointmentDialog({
  open,
  onClose,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: Date;
}) {
  const create = useCreateAppointment();
  const { data: dentists } = useDentists();
  const [patientSearch, setPatientSearch] = useState('');
  const { data: patientsData } = usePatients({ search: patientSearch, limit: 10 });

  const defaultDateStr = format(defaultDate, "yyyy-MM-dd");
  const defaultStartStr = `${defaultDateStr}T09:00`;
  const defaultEndStr = `${defaultDateStr}T09:30`;

  const [form, setForm] = useState({
    patientId: '',
    dentistId: '',
    type: 'CONSULTATION',
    startTime: defaultStartStr,
    endTime: defaultEndStr,
    notes: '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.patientId) { toast.error('Select a patient'); return; }
    if (!form.startTime || !form.endTime) { toast.error('Set date/time'); return; }
    create.mutate(
      {
        patientId: form.patientId,
        dentistId: form.dentistId || undefined,
        type: form.type,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => { toast.success('Appointment created'); onClose(); },
        onError: (e: unknown) => toast.error((e as Error).message ?? 'Failed to create'),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Appointment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient search */}
          <div className="space-y-1">
            <Label>Patient</Label>
            <Input
              placeholder="Search patient name..."
              value={patientSearch}
              onChange={(e) => { setPatientSearch(e.target.value); set('patientId', ''); }}
            />
            {patientSearch && patientsData?.data && patientsData.data.length > 0 && !form.patientId && (
              <div className="border rounded-md max-h-36 overflow-y-auto shadow-sm bg-background">
                {patientsData.data.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => {
                      set('patientId', p.id);
                      setPatientSearch(`${p.firstName} ${p.lastName}`);
                    }}
                  >
                    {p.firstName} {p.lastName}
                    {p.phone && <span className="ml-2 text-muted-foreground text-xs">{p.phone}</span>}
                  </button>
                ))}
              </div>
            )}
            {form.patientId && (
              <p className="text-xs text-success">✓ Patient selected</p>
            )}
          </div>

          {/* Dentist */}
          <div className="space-y-1">
            <Label>Dentist (optional)</Label>
            {/* Radix reserves the empty string for "nothing selected" and throws on an item that
                uses it, which took the whole dialog down as it opened. Same sentinel the pipeline
                filters use. */}
            <Select
              value={form.dentistId || UNASSIGNED}
              onValueChange={(v) => set('dentistId', v === UNASSIGNED ? '' : v)}
            >
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {dentists?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    Dr. {d.firstName} {d.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {APPOINTMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date/time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start</Label>
              <Input type="datetime-local" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>End</Label>
              <Input type="datetime-local" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Any special notes..."
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create Appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AppointmentsPage() {
  const { user } = useAuth();
  const mayBook = (APPOINTMENT_WRITE as readonly string[]).includes(user?.role ?? '');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newDialogDate, setNewDialogDate] = useState(new Date());

  // The visible range, derived from the view rather than the calendar month. Fetching the month
  // meant a week straddling two months — the last week of July, say — silently showed nothing for
  // its August days: the appointments existed, the query had simply not asked for them.
  const [rangeFrom, rangeTo] = useMemo((): [string, string] => {
    switch (currentView) {
      case Views.MONTH: {
        // A month grid shows leading and trailing days from the neighbouring months.
        const from = startOfWeek(startOfMonth(currentDate), { locale: enUS });
        const to = endOfWeek(endOfMonth(currentDate), { locale: enUS });
        return [from.toISOString(), to.toISOString()];
      }
      case Views.DAY:
        return [startOfDay(currentDate).toISOString(), endOfDay(currentDate).toISOString()];
      case Views.AGENDA:
        // react-big-calendar's agenda runs a month forward from the current date.
        return [startOfDay(currentDate).toISOString(), endOfDay(addDays(currentDate, 30)).toISOString()];
      default:
        return [
          startOfWeek(currentDate, { locale: enUS }).toISOString(),
          endOfWeek(currentDate, { locale: enUS }).toISOString(),
        ];
    }
  }, [currentDate, currentView]);

  const calendarQuery = useAppointments(rangeFrom, rangeTo);
  const { data: appointments, isLoading } = calendarQuery;

  // Map API appointments → calendar events
  const events = useMemo(
    () =>
      (appointments ?? []).map((appt) => ({
        id: appt.id,
        title: `${appt.patient.firstName} ${appt.patient.lastName} — ${
          APPOINTMENT_TYPES.find((t) => t.value === appt.type)?.label ?? appt.type
        }`,
        start: new Date(appt.startTime),
        end: new Date(appt.endTime),
        resource: appt,
      })),
    [appointments]
  );

  const handleSelectEvent = useCallback((event: { resource?: Appointment }) => {
    if (event.resource) setSelectedAppt(event.resource);
  }, []);

  const handleSelectSlot = useCallback(({ start }: { start: Date }) => {
    // Dragging out a slot is a way of starting a booking, so it answers to the same right.
    if (!mayBook) return;
    setNewDialogDate(start);
    setNewDialogOpen(true);
  }, [mayBook]);

  // One step is whatever the current view shows, so the arrows always move by exactly the span on
  // screen — a day in day view, a week in week view.
  const step = (direction: 1 | -1) => {
    setCurrentDate((d) => {
      const nd = new Date(d);
      if (currentView === Views.MONTH) nd.setMonth(nd.getMonth() + direction);
      else if (currentView === Views.DAY) nd.setDate(nd.getDate() + direction);
      else nd.setDate(nd.getDate() + 7 * direction);
      return nd;
    });
  };

  const goToday = () => setCurrentDate(new Date());

  // Week and day columns get Google's date-over-weekday head; the month grid keeps a plain weekday
  // strip, where a date number would be wrong — those cells carry their own.
  const calendarComponents = useMemo(
    () =>
      currentView === Views.MONTH || currentView === Views.AGENDA
        ? {}
        : { header: GoogleDayHeader, timeGutterHeader: TimezoneCorner },
    [currentView],
  );

  return (
    <div className="gcal flex h-full flex-col gap-4">
      {/* Google's calendar bar: create on the left, then Today and the arrows, the range title,
          and the view switcher pushed to the right. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Everyone reads the diary, but only the desk and the clinicians book it. Offering the
            button to a sales consultant led them into a dialog whose patient search returns
            nothing — patient records are not theirs — and a submit that would be refused. */}
        {mayBook && (
          <Button onClick={() => { setNewDialogDate(new Date()); setNewDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Create
          </Button>
        )}

        <Button variant="outline" size="sm" className="ml-2 rounded-full" onClick={goToday}>
          Today
        </Button>

        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <h1 className="text-[22px] font-normal tracking-tight" style={{ color: 'var(--gc-text)' }}>
          {rangeTitle(currentDate, currentView)}
        </h1>

        <span className="text-xs text-muted-foreground">
          {isLoading ? 'Loading…' : calendarQuery.isError ? 'Not loaded' : `${appointments?.length ?? 0} in view`}
        </span>

        <div className="ml-auto flex gap-0.5 rounded-lg border p-0.5">
          {([Views.DAY, Views.WEEK, Views.MONTH, Views.AGENDA] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setCurrentView(v)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                currentView === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === Views.AGENDA ? 'Schedule' : v}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      {isLoading ? (
        <Skeleton className="w-full flex-1 rounded-lg" style={{ minHeight: 500 }} />
      ) : calendarQuery.isError ? (
        // An empty grid is the one thing this screen must never show on failure: a receptionist
        // reads a blank week as a free week and books over it.
        <QueryError error={calendarQuery.error} onRetry={calendarQuery.refetch} variant="page" />
      ) : (
        <div className="min-h-0 flex-1" style={{ minHeight: 560 }}>
          <Calendar
            localizer={localizer}
            events={events}
            date={currentDate}
            view={currentView}
            onNavigate={setCurrentDate}
            onView={setCurrentView}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            selectable
            eventPropGetter={eventStyleGetter}
            components={calendarComponents}
            // Half-hour slots under a solid hour rule, the way Google divides the day.
            step={30}
            timeslots={2}
            // The whole day stays reachable by scrolling, but the view opens on clinic hours
            // instead of at midnight.
            scrollToTime={SCROLL_TO}
            formats={CALENDAR_FORMATS}
            style={{ height: '100%' }}
            toolbar={false}
            popup
          />
        </div>
      )}

      {/* Dialogs */}
      <AppointmentDetailDialog appointment={selectedAppt} onClose={() => setSelectedAppt(null)} />
      <NewAppointmentDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        defaultDate={newDialogDate}
      />
    </div>
  );
}
