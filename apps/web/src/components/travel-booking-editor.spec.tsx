import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TravelBookingEditor, Booking } from './travel-booking-editor';
import { apiRequest } from '../lib/api-client';
jest.mock('../context/auth-context', () => ({ useAuth: () => ({ accessToken: 'fixture' }) }));
jest.mock('../lib/api-client', () => ({ apiRequest: jest.fn() }));
jest.mock('../hooks/use-files', () => ({
  useFiles: () => ({ data: [] }),
  useUploadFile: () => ({ isPending: false }),
  useFileDownload: () => jest.fn(),
}));
const details = {
  patientId: 'patient',
  leadId: 'deal',
  visit: 1,
  status: 'DRAFT',
  arrival: null,
  departure: null,
  detailsConfirmed: false,
  passengers: 1,
  companions: '',
  treatmentPlanId: null,
  hotel: { name: '', room: '', checkIn: null, checkOut: null, nights: 0 },
  readiness: {},
  notes: '',
};
function display(booking?: Booking, onSaved = jest.fn()) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TravelBookingEditor patientId="patient" leadId="deal" booking={booking} onSaved={onSaved} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  (apiRequest as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve(path.includes('/extraction') ? [] : { id: 'booking', revision: 1, details }),
  );
});
it('saves the existing patient/deal and selected visit without requiring Google to respond', async () => {
  const onSaved = jest.fn();
  display(undefined, onSaved);
  fireEvent.change(screen.getByLabelText('Visit'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save travel booking' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const call = (apiRequest as jest.Mock).mock.calls.find(
    ([path]) => path === '/api/travel/bookings',
  );
  expect(JSON.parse(call[1].body)).toEqual(
    expect.objectContaining({ patientId: 'patient', leadId: 'deal', visit: 2 }),
  );
  expect(screen.getByRole('status')).toHaveTextContent('queued separately');
});
it('resets flight confirmation when a previously confirmed flight is edited', () => {
  display({
    id: 'booking',
    revision: 2,
    details: {
      ...details,
      detailsConfirmed: true,
      arrival: {
        local: '2026-10-31T23:45',
        timezone: 'Europe/Istanbul',
        offset: '+03:00',
        origin: 'CDG',
        destination: 'IST',
        number: 'TK123',
      },
    },
  });
  const checkbox = screen.getByRole('checkbox', { name: /I checked the dates/ });
  expect(checkbox).toBeChecked();
  fireEvent.change(screen.getByLabelText('number'), { target: { value: 'TK456' } });
  expect(checkbox).not.toBeChecked();
  expect(screen.getByLabelText('Visit')).toBeDisabled();
});
it('keeps the editor usable and displays a save error without claiming success', async () => {
  (apiRequest as jest.Mock).mockRejectedValue(new Error('Booking changed. Reload before saving.'));
  display();
  fireEvent.click(screen.getByRole('button', { name: 'Save travel booking' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Booking changed'));
  expect(screen.getByRole('button', { name: 'Save travel booking' })).not.toBeDisabled();
});
