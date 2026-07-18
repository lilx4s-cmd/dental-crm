'use client';

import 'react-big-calendar/lib/css/react-big-calendar.css';

import { useState, useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { Plus, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppointments, useCreateAppointment, useUpdateAppointment, type Appointment } from '@/hooks/use-appointments';
import { usePatients } from '@/hooks/use-patients';
import { useDentists } from '@/hooks/use-users';

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
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  CONFIRMED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  COMPLETED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  NO_SHOW: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const DEFAULT_EVENT_COLOR = '#6366f1';

// ─── Calendar event style ────────────────────────────────────────────────────
function eventStyleGetter(event: { resource?: Appointment }) {
  const appt = event.resource;
  const color = appt?.dentist?.calendarColor ?? DEFAULT_EVENT_COLOR;
  return {
    style: {
      backgroundColor: color,
      borderColor: color,
      borderRadius: '6px',
      color: '#fff',
      fontSize: '0.75rem',
      padding: '1px 4px',
    },
  };
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

        {appointment.status !== 'CANCELLED' && appointment.status !== 'COMPLETED' && (
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
              <p className="text-xs text-green-600 dark:text-green-400">✓ Patient selected</p>
            )}
          </div>

          {/* Dentist */}
          <div className="space-y-1">
            <Label>Dentist (optional)</Label>
            <Select value={form.dentistId} onValueChange={(v) => set('dentistId', v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
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
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newDialogDate, setNewDialogDate] = useState(new Date());

  // Fetch appointments for visible range (current month ± buffer)
  const rangeFrom = useMemo(() => {
    const d = subMonths(startOfMonth(currentDate), 0);
    d.setDate(1);
    return d.toISOString();
  }, [currentDate]);

  const rangeTo = useMemo(() => {
    const d = endOfMonth(addMonths(currentDate, 0));
    return d.toISOString();
  }, [currentDate]);

  const { data: appointments, isLoading } = useAppointments(rangeFrom, rangeTo);

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
    setNewDialogDate(start);
    setNewDialogOpen(true);
  }, []);

  const goBack = () => {
    setCurrentDate((d) => {
      const nd = new Date(d);
      if (currentView === Views.MONTH) nd.setMonth(nd.getMonth() - 1);
      else nd.setDate(nd.getDate() - 7);
      return nd;
    });
  };

  const goForward = () => {
    setCurrentDate((d) => {
      const nd = new Date(d);
      if (currentView === Views.MONTH) nd.setMonth(nd.getMonth() + 1);
      else nd.setDate(nd.getDate() + 7);
      return nd;
    });
  };

  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? 'Loading...' : `${appointments?.length ?? 0} appointments in view`}
          </p>
        </div>
        <Button onClick={() => { setNewDialogDate(new Date()); setNewDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Appointment
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={goToday}>
          <CalendarDays className="h-4 w-4 mr-1" />
          Today
        </Button>
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={goForward}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-32">
          {format(currentDate, currentView === Views.MONTH ? 'MMMM yyyy' : "'Week of' MMM d, yyyy")}
        </span>

        <div className="ml-auto flex gap-1 border rounded-md p-0.5">
          {([Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setCurrentView(v)}
              className={`px-3 py-1 text-xs rounded font-medium capitalize transition-colors ${
                currentView === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      {isLoading ? (
        <Skeleton className="flex-1 w-full rounded-lg" style={{ minHeight: 500 }} />
      ) : (
        <div className="flex-1 rounded-lg border bg-background overflow-hidden" style={{ minHeight: 560 }}>
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
