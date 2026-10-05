import { fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { NewTreatmentPlanDialog } from './new-treatment-plan-dialog';
import type { TreatmentPlan } from '@/hooks/use-treatment-plans';

const mutate = jest.fn();
jest.mock('../../hooks/use-treatment-plans', () => ({
  useCreateTreatmentPlan: () => ({ mutate, isPending: false }),
  useTreatmentCategories: () => ({ data: [] }),
}));
jest.mock('../../hooks/use-users', () => ({ useDentists: () => ({ data: [] }), useCoordinators: () => ({ data: [] }) }));
jest.mock('../../hooks/use-reports', () => ({ useClinicSettings: () => ({ data: { currency: 'USD', defaultPackageIncludes: ['HOTEL'], defaultPaymentTerms: 'Each visit is paid separately.' } }) }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('./dental-chart', () => ({ DentalChart: () => <div>Dental chart</div> }));

beforeEach(() => { jest.clearAllMocks(); });
const open = (initialPlan?: TreatmentPlan) => render(<NewTreatmentPlanDialog patientId="fixture-patient" open onClose={jest.fn()} initialPlan={initialPlan} />);

it('creates a priced proposal using the clinic currency and the package selected in the form', () => {
  open();
  fireEvent.change(screen.getByLabelText('Plan Title *'), { target: { value: 'Implant proposal' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Implant placement' } });
  fireEvent.change(screen.getByPlaceholderText('Unit price'), { target: { value: '500' } });
  fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '6' } });
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Package & Payment' }));
  fireEvent.change(screen.getByLabelText('Deposit (USD)'), { target: { value: '300' } });
  fireEvent.change(screen.getByLabelText('Card fee %'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    patientId: 'fixture-patient', title: 'Implant proposal', currency: 'USD',
    depositAmount: 300, cardFeePercent: 5, packageIncludes: ['HOTEL'],
    paymentTerms: 'Each visit is paid separately.',
    items: [expect.objectContaining({ description: 'Implant placement', quantity: 6, unitPrice: 500, cost: 3000 })],
  }), expect.anything());
});

it('rejects fractional quantities and an excessive deposit before creating a plan', () => {
  open();
  fireEvent.change(screen.getByLabelText('Plan Title *'), { target: { value: 'Fixture plan' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Crown' } });
  fireEvent.change(screen.getByPlaceholderText('Unit price'), { target: { value: '500' } });
  fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
  expect(mutate).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('whole numbers'));
  fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '1' } });
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Package & Payment' }));
  fireEvent.change(screen.getByLabelText('Deposit (USD)'), { target: { value: '600' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
  expect(mutate).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('deposit'));
});

it('keeps an unpriced procedure provisional instead of explicitly quoting it as free', () => {
  open();
  fireEvent.change(screen.getByLabelText('Plan Title *'), { target: { value: 'Draft crown proposal' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Crown' } });
  expect(screen.getByText(/Provisional subtotal/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Create Plan' }));
  expect(mutate.mock.calls[0][0].items[0]).toMatchObject({ cost: 0, unitPrice: undefined });
});

it('revises treatments and payment terms into a new proposal without copying booked travel', () => {
  const original = {
    title: 'Original', currency: 'EUR', language: 'en', notes: null,
    items: [{ description: 'Zirconia crown', quantity: 12, unitPrice: 200, cost: 2400, discount: 0, phaseNumber: 2, material: 'Zirconia', brand: 'Example brand' }],
    diagnoses: [], phases: [{ phaseNumber: 2, name: 'Final restorations', discountAmount: 0, healingPeriodMonths: null }],
    packageIncludes: [], paymentTerms: 'Seven-day second visit.',
    stay: { arrivalDate: '2026-11-01' }, scheduleItems: [{ title: 'Booked flight' }],
  } as unknown as TreatmentPlan;
  open(original);
  fireEvent.click(screen.getByRole('button', { name: 'Create revised plan' }));
  expect(mutate.mock.calls[0][0]).toMatchObject({ title: 'Original - revised proposal', currency: 'EUR', paymentTerms: original.paymentTerms, items: [expect.objectContaining({ cost: 2400, phaseNumber: 2, brand: 'Example brand' })] });
  expect(mutate.mock.calls[0][0].stay).toBeUndefined();
  expect(mutate.mock.calls[0][0].scheduleItems).toBeUndefined();
  expect(original.title).toBe('Original');
});
