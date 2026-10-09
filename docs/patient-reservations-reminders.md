# Patient views and approaching-date reminders

## Implementation prompt

Improve the existing dental CRM so opening Patients shows Working patients, Finished patients,
and Reservations grouped by month and year. Make every view filterable by name or contact,
responsible staff, reservation month, and approaching dates. Count each patient once in a month,
even when there are several visits, flights, or appointments. Keep future reservations visible
when a patient's previous treatment is finished. Show responsible staff and scheduled clinic,
arrival, and departure dates, with direct links to the relevant record.

Add an explicit treatment completion action and reopening action. Do not infer completion from
payments, conversion of a lead, an old appointment, archiving, or automatically started aftercare.
Preserve existing patient information and access controls.

Show patient arrivals and return flights on the CRM calendar alongside clinic appointments.
Preserve actual stored instants and booked flight timezones. Add an upcoming-patient panel above
the calendar. Enhance the existing Google Calendar integration with patient names and popup
reminders, retaining its deterministic event IDs, updates, and cancellation behavior.

Send responsible staff and clinic managers in-app reminders before patient appointments, arrivals,
and departures. Default to 7 days, 1 day, and 2 hours before the event. Allow clinic administrators
to configure these intervals. Use existing mobile push only for staff who enabled it; observe
working hours for push and keep in-app reminders available immediately. Include a notification
bell, unread count, an inbox, and links to the actual booking or appointment day.

Deduplicate reminders across worker restarts. Recheck dates, booking status, current ownership,
and permissions immediately before sending. Cancel stale reminders when a booking changes,
a patient is archived, or an event is cancelled. Catch up with the most urgent remaining interval
without sending all missed intervals at once. Verify with fictional records and isolated storage.

## Result and operation

- Working is the default Patients view. Staff explicitly mark treatment finished on the patient
  page and can reopen it. Existing patients begin as Working to avoid guessing clinical completion.
- Reservation months include arrival, departure, and scheduled clinic dates, in Europe/Istanbul.
  Search, month, staff, and approaching-date filters combine across views. Cancelled/draft travel
  and cancelled clinic appointments are excluded. Finished treatment does not remove future visits.
- The calendar grid displays actual instants in the device timezone. Flight dialogs preserve the
  booked local date and IANA timezone. Appointment links include the instant so they open the
  correct calendar day in the viewer's timezone.
- Reminders run every minute through the existing API process, and the existing delivery worker
  processes them every 30 seconds. They need a continuously running API for timely background
  delivery. An API host that sleeps can catch up on wake, only while the event is still upcoming.
- Responsible sales staff, their supervisors, appointment dentists/creators, and managers receive
  reminders according to current permissions. Patient reminders use in-app and opted-in push.
- Mobile push requires the existing VAPID configuration and a subscribed staff device. Enable it
  in Notifications. CRM reminders remain available without push configuration.
- Connected Google calendars refresh future flight events after the migration and reminder settings
  changes. Google Calendar remains an optional integration.

## Verification

The PostgreSQL regression checks apply the migration to the previous schema and existing patients,
then exercise service methods against an isolated database. They cover monthly unique counts,
multiple visits, year boundaries, explicit completion/reopening, persistent deduplication,
record reassignment, cancellation, changed dates, notification ownership, and calendar visibility.
Unit checks cover reminder intervals, permission revalidation, push opt-in, and stale queued intervals.
Screen checks cover view/filter changes, future finished-patient visits, calendar flights and
booked timezones, notification links, and failed requests.
