import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentConfigurationSchema } from '@dental-crm/shared';
import { ConsultationEditor } from './consultation-editor';
jest.mock('../../context/auth-context', () => ({
  useAuth: () => ({ accessToken: 'fixture-token' }),
}));
jest.mock('../../lib/api-client', () => ({
  apiRequest: jest.fn(),
  apiRequestDownload: jest
    .fn()
    .mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }) }),
}));
jest.mock('./consultation-chart', () => ({
  ConsultationChart: () => <div>Chart</div>,
  TreatmentProcess: () => <div>Process</div>,
}));
const source = {
  patient: { id: 'existing-patient', firstName: 'Existing', lastName: 'Patient' },
  clinic: { clinicName: 'Test clinic', currency: 'USD' },
  preferredLanguage: 'en',
  config: DocumentConfigurationSchema.parse({
    defaultNights: [5, 7],
    priceList: [
      { type: 'crown', currency: 'USD', unitPrice: 120 },
      { type: 'implant', currency: 'USD', unitPrice: 350 },
    ],
  }),
};
it('prefills the patient and reads a two-visit proposal with clinic crown prices', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConsultationEditor source={source} onClose={jest.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Existing Patient/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Treatment'), {
    target: { value: '12 implants + 24 crowns' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read treatment' }));
  const quantities = screen.getAllByLabelText('Quantity');
  expect(quantities.map((input) => (input as HTMLInputElement).value)).toEqual(['12', '24']);
  const prices = screen.getAllByLabelText('Unit price');
  expect(prices[1]).toBeDisabled();
  expect((prices[1] as HTMLInputElement).value).toBe('120');
  expect(screen.getAllByText('Visit 2').length).toBeGreaterThan(0);
});
