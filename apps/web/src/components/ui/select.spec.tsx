import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

function Example() {
  const [value, setValue] = useState('dentist-1');
  return <>
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger aria-label="Dentist"><SelectValue placeholder="Unassigned" /></SelectTrigger>
      <SelectContent><SelectItem value="">Unassigned</SelectItem><SelectItem value="dentist-1">Dentist One</SelectItem></SelectContent>
    </Select>
    <output aria-label="Selected dentist">{value || 'none'}</output>
  </>;
}

it('opens a selector containing a clear option and clears the assignment without crashing', async () => {
  Element.prototype.scrollIntoView = jest.fn();
  render(<Example />);
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
  const clear = await screen.findByRole('option', { name: 'Unassigned' });
  fireEvent.click(clear);
  expect(screen.getByLabelText('Selected dentist')).toHaveTextContent('none');
  expect(screen.getByRole('combobox')).toHaveTextContent('Unassigned');
});
