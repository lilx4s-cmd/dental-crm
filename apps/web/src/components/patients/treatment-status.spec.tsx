import { fireEvent, render, screen } from '@testing-library/react';
import { TreatmentStatus } from './treatment-status';
import { useTreatmentStatus } from '@/hooks/use-patients';
import { useAuth } from '@/context/auth-context';
jest.mock('@/hooks/use-patients', () => ({ useTreatmentStatus: jest.fn() }));
jest.mock('@/context/auth-context', () => ({ useAuth: jest.fn() }));
it('requires an explicit completion click and supports reopening', () => {
  const mutate = jest.fn();
  (useTreatmentStatus as jest.Mock).mockReturnValue({ mutate, isPending: false });
  (useAuth as jest.Mock).mockReturnValue({ user: { role: 'CLINIC_MANAGER' } });
  const view = render(
    <TreatmentStatus patient={{ id: 'patient', treatmentStatus: 'WORKING' } as never} />,
  );
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Mark treatment finished' }));
  expect(mutate).toHaveBeenLastCalledWith('FINISHED', expect.any(Object));
  view.rerender(
    <TreatmentStatus patient={{ id: 'patient', treatmentStatus: 'FINISHED' } as never} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reopen patient' }));
  expect(mutate).toHaveBeenLastCalledWith('WORKING', expect.any(Object));
});
it('keeps the completion action hidden when the staff member cannot update patients', () => {
  (useTreatmentStatus as jest.Mock).mockReturnValue({ mutate: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ user: { role: 'DENTIST' } });
  render(<TreatmentStatus patient={{ id: 'patient', treatmentStatus: 'WORKING' } as never} />);
  expect(screen.queryByRole('button')).toBeNull();
});
