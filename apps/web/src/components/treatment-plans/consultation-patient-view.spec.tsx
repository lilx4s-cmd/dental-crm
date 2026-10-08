import { fireEvent, render, screen } from '@testing-library/react';
import { consultationExample } from '@dental-crm/shared';
import { ConsultationPatientView } from './consultation-patient-view';
jest.mock('./consultation-chart', () => ({
  ConsultationChart: ({
    mode
  }: {
    mode: string;
  }) => <div data-testid="chart-mode">{mode}</div>,
  TreatmentProcess: () => <div />
}));
it('shows the same visit fees and quoted cash/card deposit balances as the saved plan', () => {
  const example = consultationExample();
  render(<ConsultationPatientView plan={example.plan} payment={example.payment} identity={example.config} patientName="Fictional Patient" />);
  expect(screen.getAllByText('USD 1,795.00').length).toBeGreaterThan(0);
  expect(screen.getByText('USD 1,811.87')).toBeInTheDocument();
  expect(screen.getByText('USD 1,459.10')).toBeInTheDocument();
  expect(screen.getByText('USD 1,511.87')).toBeInTheDocument();
  expect(screen.getByText(/not a receipt or confirmation of a payment received/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {
    name: 'Recorded findings'
  }));
  expect(screen.getAllByTestId('chart-mode').every(chart => chart.textContent === 'recorded')).toBe(true);
});
it('does not present partially priced treatment or deposit remainders as a complete quote', () => {
  const example = consultationExample();
  const plan = {
    ...example.plan,
    lines: example.plan.lines.map(line => ({
      ...line,
      unitPrice: null,
      discount: 0
    }))
  };
  render(<ConsultationPatientView plan={plan} payment={example.payment} />);
  expect(screen.queryByText('USD 1,795.00')).not.toBeInTheDocument();
  expect(screen.queryByText('USD 1,459.10')).not.toBeInTheDocument();
  expect(screen.getAllByText('Price to be confirmed').length).toBeGreaterThan(0);
});
it('preserves Arabic direction and isolates FDI and financial numbers', () => {
  const example = consultationExample('ar');
  const {
    container
  } = render(<ConsultationPatientView plan={example.plan} payment={example.payment} identity={example.config} />);
  expect(container.querySelector('article')).toHaveAttribute('dir', 'rtl');
  expect(container.querySelector('bdi[dir="ltr"]')).toBeInTheDocument();
  expect(screen.getByRole('button', {
    name: 'الحالة المسجلة'
  })).toBeInTheDocument();
});
