'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateItinerary, type TreatmentPlan } from '@/hooks/use-treatment-plans';
import {
  EMPTY_STAY,
  StayScheduleEditor,
  schedulePayload,
  stayPayload,
  type ScheduleItemForm,
  type StayForm,
} from './stay-schedule-editor';

/** ISO timestamp to the yyyy-mm-dd a date input needs, read in local time. */
function dateValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/**
 * Edits travel and schedule after the plan exists. This is the normal case, not an afterthought:
 * the hotel is usually booked days before the flight number is known, and the plan is quoted before
 * either.
 */
export function EditItineraryDialog({
  plan,
  patientId,
  open,
  onClose,
}: {
  plan: TreatmentPlan;
  patientId: string;
  open: boolean;
  onClose: () => void;
}) {
  const save = useUpdateItinerary(patientId);
  const [stay, setStay] = useState<StayForm>({ ...EMPTY_STAY });
  const [schedule, setSchedule] = useState<ScheduleItemForm[]>([]);

  // Reload from the plan each time it opens, so an abandoned edit is not still sitting there
  // the next time someone opens it.
  useEffect(() => {
    if (!open) return;
    const s = plan.stay;
    setStay({
      arrivalDate: dateValue(s?.arrivalDate),
      arrivalFlight: str(s?.arrivalFlight),
      departureDate: dateValue(s?.departureDate),
      departureFlight: str(s?.departureFlight),
      hotelName: str(s?.hotelName),
      hotelAddress: str(s?.hotelAddress),
      roomType: str(s?.roomType),
      nights: str(s?.nights),
      companions: str(s?.companions),
      checkInDate: dateValue(s?.checkInDate),
      checkOutDate: dateValue(s?.checkOutDate),
      airportTransfer: str(s?.airportTransfer),
      clinicTransfer: str(s?.clinicTransfer),
      notes: str(s?.notes),
    });
    setSchedule(
      (plan.scheduleItems ?? []).map((i) => ({
        date: dateValue(i.date),
        time: str(i.time),
        title: i.title,
        location: str(i.location),
        notes: str(i.notes),
      })),
    );
  }, [open, plan]);

  const submit = () => {
    save.mutate(
      { id: plan.id, stay: stayPayload(stay), scheduleItems: schedulePayload(schedule) },
      {
        onSuccess: () => {
          toast.success('Itinerary updated');
          onClose();
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save the itinerary'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stay &amp; Schedule — {plan.title}</DialogTitle>
        </DialogHeader>

        <StayScheduleEditor
          stay={stay}
          schedule={schedule}
          onStayChange={setStay}
          onScheduleChange={setSchedule}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save itinerary'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
