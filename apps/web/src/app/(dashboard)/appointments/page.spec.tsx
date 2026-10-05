import { render, screen } from '@testing-library/react';
import AppointmentsPage from './page';
import { useAppointments } from '../../../hooks/use-appointments';

const mockParams = new URLSearchParams({ view: 'day', date: '2026-10-05' });
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams }));
jest.mock('../../../context/auth-context', () => ({ useAuth: () => ({ user: { role: 'SUPER_ADMIN' } }) }));
jest.mock('../../../hooks/use-appointments', () => ({ useAppointments: jest.fn(() => ({ data: [], isLoading: false })), useCreateAppointment: () => ({}), useUpdateAppointment: () => ({}) }));
jest.mock('../../../hooks/use-patients', () => ({ usePatients: () => ({ data: { data: [] } }) }));
jest.mock('../../../hooks/use-users', () => ({ useDentists: () => ({ data: [] }) }));
jest.mock('react-big-calendar', () => ({
  Views: { DAY: 'day', WEEK: 'week', MONTH: 'month', AGENDA: 'agenda' },
  dateFnsLocalizer: () => ({}),
  Calendar: ({ date, view }: { date: Date; view: string }) => <div aria-label="Calendar view">{view} · {date.getFullYear()}-{date.getMonth() + 1}-{date.getDate()}</div>,
}));

it('opens the dashboard appointment link on the requested day instead of the default week', () => {
  render(<AppointmentsPage />);
  expect(screen.getByLabelText('Calendar view')).toHaveTextContent('day · 2026-10-5');
  const [from, to] = (useAppointments as jest.Mock).mock.calls[0];
  expect(new Date(from).getDate()).toBe(5);
  expect(new Date(to).getDate()).toBe(5);
});
