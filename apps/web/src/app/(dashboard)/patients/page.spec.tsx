import { fireEvent, render, screen } from '@testing-library/react';
import PatientsPage from './page';
import { usePatients, usePatientSummary } from '@/hooks/use-patients';
jest.mock('@/hooks/use-patients', () => ({ usePatients: jest.fn(), usePatientSummary: jest.fn() }));
jest.mock('@/components/patients/new-patient-dialog', () => ({
  NewPatientDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const patient = {
  id: 'fictional',
  firstName: 'Fictional',
  lastName: 'Patient',
  phone: '+12025550123',
  email: null,
  tags: [],
  treatmentStatus: 'FINISHED',
  travelBookings: [
    {
      id: 'visit-2',
      visit: 2,
      arrivalAt: '2027-01-14T09:00:00Z',
      departureAt: '2027-01-21T09:00:00Z',
    },
  ],
  convertedFromLead: { assignedTo: { id: 'owner', firstName: 'Owner', lastName: 'Staff' } },
};
beforeEach(() => {
  jest.clearAllMocks();
  (usePatients as jest.Mock).mockReturnValue({
    data: { data: [patient], meta: { total: 1, page: 1, totalPages: 1 } },
    isLoading: false,
  });
  (usePatientSummary as jest.Mock).mockReturnValue({
    data: {
      working: 4,
      finished: 2,
      reservations: 3,
      months: [{ month: '2027-01', count: 3 }],
      staffOptions: [{ id: 'owner', firstName: 'Owner', lastName: 'Staff' }],
    },
  });
});
it('opens Working first and combines reservation months, staff and approaching-date filters', () => {
  render(<PatientsPage />);
  expect(usePatients).toHaveBeenLastCalledWith(
    expect.objectContaining({ view: 'working', page: 1 }),
  );
  fireEvent.click(screen.getByRole('button', { name: /January 2027/ }));
  expect(usePatients).toHaveBeenLastCalledWith(
    expect.objectContaining({ view: 'reservations', month: '2027-01', page: 1 }),
  );
  fireEvent.change(screen.getByLabelText('Responsible staff'), { target: { value: 'owner' } });
  fireEvent.change(screen.getByLabelText('Approaching dates'), { target: { value: '7' } });
  expect(usePatients).toHaveBeenLastCalledWith(
    expect.objectContaining({
      view: 'reservations',
      month: '2027-01',
      staffId: 'owner',
      dueDays: 7,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: /Finished patients/ }));
  expect(usePatients).toHaveBeenLastCalledWith(
    expect.objectContaining({ view: 'finished', month: '2027-01', staffId: 'owner' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(usePatients).toHaveBeenLastCalledWith(
    expect.objectContaining({
      view: 'finished',
      month: undefined,
      staffId: undefined,
      dueDays: undefined,
    }),
  );
});
it('shows future visits for finished patients and links to the correct booking', () => {
  render(<PatientsPage />);
  expect(screen.getByRole('link', { name: /Travel · Visit 2/ })).toHaveAttribute(
    'href',
    '/travel?bookingId=visit-2',
  );
  expect(screen.getByText('Finished', { exact: true })).toBeVisible();
  expect(screen.getByText(/Responsible staff: Owner Staff/)).toBeVisible();
});
it('keeps a failed list visibly failed rather than claiming no patients', () => {
  (usePatients as jest.Mock).mockReturnValue({ isError: true, error: new Error('Unavailable') });
  render(<PatientsPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
  expect(screen.queryByText('No patients match this view and its filters.')).toBeNull();
});
