'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDentists } from '@/hooks/use-users';
import { useBookScheduleItem } from '@/hooks/use-treatment-plans';

/** Only what booking needs. Demanding the whole schedule-item type would couple this dialog to
 *  fields it never reads, and to the portal's narrower projection of the same rows. */
export interface BookableScheduleItem {
  id: string;
  title: string;
  date: string;
}

/** Radix reserves '' for "no selection", so "no dentist yet" needs a value of its own. */
const UNASSIGNED = '__unassigned__';

const TYPES = [
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'TREATMENT', label: 'Treatment' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'OTHER', label: 'Other' },
];

/** Local datetime string for the input, from a date and an hour. */
function slot(date: string, hour: number, minutes = 0) {
  const d = new Date(date);
  d.setHours(hour, minutes, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Turns a printed itinerary line into a real booking.
 *
 * Times are asked for rather than parsed from the line: a schedule item's time is free text, and
 * "Morning" is a legitimate value while the exact slot is undecided. Guessing would reserve a chair
 * at an hour nobody chose. The line's own date does seed the field, since that part is certain.
 */
export function BookScheduleItemDialog({
  planId,
  patientId,
  item,
  open,
  onClose,
}: {
  planId: string;
  patientId: string;
  item: BookableScheduleItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const book = useBookScheduleItem(patientId);
  const { data: dentists } = useDentists();

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [dentistId, setDentistId] = useState(UNASSIGNED);
  const [type, setType] = useState('TREATMENT');

  // Seeded from the line the first time the dialog opens for it. Nine to ten is a starting point
  // to adjust, not a guess presented as a decision.
  if (open && item && !start) {
    setStart(slot(item.date, 9));
    setEnd(slot(item.date, 10));
  }

  const close = () => {
    setStart('');
    setEnd('');
    setDentistId(UNASSIGNED);
    setType('TREATMENT');
    onClose();
  };

  const submit = () => {
    if (!item) return;
    if (!start || !end) {
      toast.error('Set a start and end time');
      return;
    }
    if (new Date(end) <= new Date(start)) {
      toast.error('The appointment must end after it starts');
      return;
    }
    book.mutate(
      {
        planId,
        itemId: item.id,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        dentistId: dentistId === UNASSIGNED ? undefined : dentistId,
        type,
      },
      {
        onSuccess: () => {
          toast.success('Booked into the diary');
          close();
        },
        onError: (e) => toast.error(e.message || 'Could not book'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book “{item?.title}”</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Start</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">End</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Dentist</Label>
            <Select value={dentistId} onValueChange={setDentistId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Not assigned yet</SelectItem>
                {dentists?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    Dr. {d.firstName} {d.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={book.isPending}>
            {book.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
