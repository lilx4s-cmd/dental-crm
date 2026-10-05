import { fireEvent, render, screen } from '@testing-library/react';
import { ConsultationChart } from './consultation-chart';
import {
  DocumentConfigurationSchema,
  parseConsultation,
  type Consultation,
} from '@dental-crm/shared';
const plan: Consultation = {
  version: 1,
  language: 'ar',
  currency: 'USD',
  treatmentText: 'implant at tooth 11 + crown at tooth 11',
  lines: parseConsultation(
    'implant at tooth 11 + crown at tooth 11',
    'USD',
    DocumentConfigurationSchema.parse({}),
  ).lines,
  visits: [1, 2].map((number) => ({
    number,
    nights: 5,
    hotelRate: 0,
    hotelIncluded: false,
    transfer: 'excluded',
    transferPrice: 0,
    itinerary: [],
  })),
  healing: null,
  findings: {},
  includedServices: [],
};
it('preserves FDI order under Arabic RTL and exposes each tooth for keyboard selection', () => {
  const select = jest.fn();
  const { container } = render(<ConsultationChart plan={plan} visit={1} onSelect={select} />);
  const numbers = [...container.querySelectorAll('text')].map((n) => n.textContent);
  expect(numbers.slice(0, 16)).toEqual([
    '18',
    '17',
    '16',
    '15',
    '14',
    '13',
    '12',
    '11',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '27',
    '28',
  ]);
  fireEvent.keyDown(screen.getByRole('button', { name: /FDI 11:/ }), { key: 'Enter' });
  expect(select).toHaveBeenCalledWith('11');
});
it('updates the visible stage from an implant fixture to an implant crown', () => {
  const { rerender } = render(<ConsultationChart plan={plan} visit={1} onSelect={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'FDI 11: زرعة سنية' })).toBeInTheDocument();
  rerender(<ConsultationChart plan={plan} visit={2} onSelect={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'FDI 11: تاج على زرعة' })).toBeInTheDocument();
});
it('shows exactly the unassigned implant quantity without putting it on guessed teeth', () => {
  const next = {
    ...plan,
    language: 'en' as const,
    lines: parseConsultation('12 implants', 'USD', DocumentConfigurationSchema.parse({})).lines,
  };
  const { container } = render(<ConsultationChart plan={next} visit={1} />);
  expect(screen.getByLabelText('12 Dental implant').querySelectorAll('g')).toHaveLength(12);
  expect(container.querySelectorAll('svg')).toHaveLength(2);
});
