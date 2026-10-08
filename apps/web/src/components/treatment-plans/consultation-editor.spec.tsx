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
  fireEvent.click(screen.getByRole('button', { name: 'Apply treatment text' }));
  const quantities = screen.getAllByLabelText('Quantity');
  expect(quantities.map((input) => (input as HTMLInputElement).value)).toEqual(['12', '24']);
  const prices = screen.getAllByLabelText('Unit price');
  expect(prices[1]).toBeDisabled();
  expect((prices[1] as HTMLInputElement).value).toBe('120');
  expect(screen.getAllByText('Visit 2').length).toBeGreaterThan(0);
});

it('keeps the live patient preview local and requests a PDF only when explicitly selected', async () => {
  const { apiRequestDownload } = jest.requireMock('../../lib/api-client');
  apiRequestDownload.mockClear();
  const { consultationExample } = jest.requireActual('@dental-crm/shared');
  const example = consultationExample();
  render(<QueryClientProvider client={new QueryClient()}><ConsultationEditor source={source} initial={example.plan} initialPayment={example.payment} onClose={jest.fn()} /></QueryClientProvider>);
  expect(apiRequestDownload).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Patient preview' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'PDF preview' }));
  const { waitFor } = jest.requireActual('@testing-library/react');
  await waitFor(() => expect(apiRequestDownload).toHaveBeenCalledWith('/api/documents/preview', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"depositAmount":300') }), 'fixture-token'), { timeout: 1600 });
  expect(screen.queryByTitle('PDF preview')).not.toBeInTheDocument();
});
it('prevents unauthorised catalog discounts and keeps saved prices on a treatment-text refresh', () => {
  const { consultationExample } = jest.requireActual('@dental-crm/shared');
  const example = consultationExample();
  const initial = { ...example.plan, treatmentText: '2 implants + 2 crowns', lines: [{ ...example.plan.lines[0], brand: undefined, material: undefined, unitPrice: 420 }, { ...example.plan.lines[1], type: 'crown', brand: undefined, material: undefined }] };
  render(<QueryClientProvider client={new QueryClient()}><ConsultationEditor source={source} initial={initial} onClose={jest.fn()} /></QueryClientProvider>);
  expect(screen.getAllByLabelText('Discount').every(input => input.hasAttribute('disabled'))).toBe(true);
  fireEvent.change(screen.getAllByLabelText('Treatment', { selector: 'textarea' })[0], { target: { value: '3 implants + 2 crowns' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply treatment text' }));
  expect((screen.getAllByLabelText('Unit price')[0] as HTMLInputElement).value).toBe('420');
  expect((screen.getAllByLabelText('Quantity')[0] as HTMLInputElement).value).toBe('3');
});
