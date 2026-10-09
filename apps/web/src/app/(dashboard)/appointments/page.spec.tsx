import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentsPage from './page';
import { usePatientSchedule } from '../../../hooks/use-patient-schedule';
import { useAppointments } from '../../../hooks/use-appointments';

const mockParams = new URLSearchParams({ view: 'day', date: '2026-10-05' });
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams }));
jest.mock('../../../context/auth-context', () => ({
  useAuth: () => ({ user: { role: 'SUPER_ADMIN' } }),
}));
jest.mock('../../../hooks/use-appointments', () => ({
  useAppointments: jest.fn(() => ({ data: [], isLoading: false })),
  useCreateAppointment: () => ({}),
  useUpdateAppointment: () => ({}),
}));
jest.mock('../../../hooks/use-patients', () => ({ usePatients: () => ({ data: { data: [] } }) }));
jest.mock('../../../hooks/use-patient-schedule', () => ({
  usePatientSchedule: jest.fn(() => ({ data: [], isLoading: false })),
}));
jest.mock('../../../hooks/use-users', () => ({ useDentists: () => ({ data: [] }) }));
jest.mock('react-big-calendar', () => ({
  Views: { DAY: 'day', WEEK: 'week', MONTH: 'month', AGENDA: 'agenda' },
  dateFnsLocalizer: () => ({}),
  Calendar: ({
    date,
    view,
    events,
    onSelectEvent,
  }: {
    date: Date;
    view: string;
    events: { id: string; title: string }[];
    onSelectEvent: (event: unknown) => void;
  }) => (
    <div aria-label="Calendar view">
      {view} · {date.getFullYear()}-{date.getMonth() + 1}-{date.getDate()}
      {events.map((e) => (
        <button key={e.id} onClick={() => onSelectEvent(e)}>
          {e.title}
        </button>
      ))}
    </div>
  ),
}));

it('opens the dashboard appointment link on the requested day instead of the default week', () => {
  render(<AppointmentsPage />);
  expect(screen.getByLabelText('Calendar view')).toHaveTextContent('day · 2026-10-5');
  const [from, to] = (useAppointments as jest.Mock).mock.calls[0];
  expect(new Date(from).getDate()).toBe(5);
  expect(new Date(to).getDate()).toBe(5);
});

it('shows patient flights in the calendar and preserves the booked timezone in details', () => {
  (usePatientSchedule as jest.Mock).mockReturnValue({
    isLoading: false,
    data: [
      {
        id: 'flight',
        kind: 'ARRIVAL',
        patientName: 'Fictional Patient',
        bookingId: 'visit-2',
        visit: 2,
        startTime: '2026-10-05T20:45:00Z',
        endTime: '2026-10-05T21:15:00Z',
        localTime: '2026-10-05 23:45',
        timezone: 'Europe/Istanbul',
        flightNumber: 'TK123',
        route: 'CDG → IST',
      },
    ],
  });
  render(<AppointmentsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Arrival · Fictional Patient · TK123' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('2026-10-05 23:45 (Europe/Istanbul)');
  expect(screen.getByRole('link', { name: 'Open travel booking' })).toHaveAttribute(
    'href',
    '/travel?bookingId=visit-2',
  );
});
it('does not show a free calendar when travel dates fail to load', () => {
  (usePatientSchedule as jest.Mock).mockReturnValue({
    isError: true,
    isLoading: false,
    error: new Error('Travel unavailable'),
  });
  render(<AppointmentsPage />);
  expect(screen.queryByLabelText('Calendar view')).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('Travel unavailable');
});
