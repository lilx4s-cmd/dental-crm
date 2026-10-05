import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TravelPage from './page';
import { apiRequest } from '../../../lib/api-client';

jest.mock('../../../context/auth-context', () => ({ useAuth: () => ({ accessToken: 'fixture' }) }));
jest.mock('../../../lib/api-client', () => ({ apiRequest: jest.fn() }));
jest.mock('../../../hooks/use-files', () => ({
  useFiles: () => ({ data: [] }),
  useUploadFile: () => ({ isPending: false }),
  useFileDownload: () => jest.fn(),
}));

it('opens the monthly booking with its existing treatment plans and reports retry failures', async () => {
  const booking = {
    id: 'booking',
    revision: 1,
    leadId: 'deal',
    patientId: 'patient',
    visit: 2,
    status: 'DRAFT',
    arrivalAt: null,
    departureAt: null,
    lead: { firstName: 'Fixture', lastName: 'Patient', assignedTo: null },
    details: {
      patientId: 'patient',
      leadId: 'deal',
      visit: 2,
      status: 'DRAFT',
      arrival: null,
      departure: null,
      detailsConfirmed: false,
      passengers: 1,
      companions: '',
      treatmentPlanId: 'plan',
      hotel: { name: '', room: '', checkIn: null, checkOut: null, nights: 0 },
      readiness: {},
      notes: '',
    },
  };
  (apiRequest as jest.Mock).mockImplementation((path: string) => {
    if (path.startsWith('/api/travel?'))
      return Promise.resolve({
        data: [booking],
        page: 1,
        total: 1,
        counts: [],
        uniqueBookedPatients: 0,
        countDefinition: 'Fixture counts',
        staffOptions: [],
      });
    if (path === '/api/travel/bookings/booking') return Promise.resolve(booking);
    if (path === '/api/travel/case/deal')
      return Promise.resolve({
        id: 'deal',
        firstName: 'Fixture',
        bookings: [],
        patient: { id: 'patient', treatmentPlans: [{ id: 'plan', title: 'Second visit crowns' }] },
      });
    if (path.endsWith('/retry'))
      return Promise.reject(new Error('Calendar connection needs attention'));
    if (path.includes('/earnings?')) return Promise.resolve({ salaries: [], commissions: [] });
    return Promise.resolve([]);
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TravelPage />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Open booking / ticket' }));
  const plan = await screen.findByLabelText('Existing treatment plan');
  expect(plan).toHaveValue('plan');
  expect(screen.getByRole('option', { name: 'Second visit crowns' })).toBeInTheDocument();
  const retry = screen.getByRole('button', { name: 'Retry calendar sync' });
  fireEvent.click(retry);
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Calendar connection needs attention',
  );
  await waitFor(() => expect(retry).toBeEnabled());
});
