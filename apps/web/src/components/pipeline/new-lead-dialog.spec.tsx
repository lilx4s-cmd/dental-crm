import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewLeadDialog } from './new-lead-dialog';
import { ConversationDealAction } from './conversation-deal-action';
const create = jest.fn(), stage = jest.fn();
jest.mock('@/hooks/use-leads', () => ({ useCreateLead: () => ({ mutateAsync: create }), useUpdateLeadStage: () => ({ mutateAsync: stage }) }));
jest.mock('@/hooks/use-users', () => ({ useUsers: () => ({ data: [] }) }));
jest.mock('@/hooks/use-reports', () => ({ useClinicSettings: () => ({ data: { currency: 'EUR' } }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { sub: 'staff', role: 'SALES_CONSULTANT' } }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), warning: jest.fn() } }));
beforeEach(() => { create.mockReset(); stage.mockReset(); create.mockResolvedValue({ id: 'deal' }); });
function open() { render(<NewLeadDialog><button>Add deal</button></NewLeadDialog>); fireEvent.click(screen.getByText('Add deal')); }
it('creates with only a known first name and preserves an unknown amount', async () => {
  open(); fireEvent.change(screen.getByLabelText('First name *'), { target: { value: 'Fictional' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Fictional', lastName: undefined, country: undefined, currency: 'EUR', estimatedValue: undefined })));
});
it('saves the chosen USD value with its currency without conversion', async () => {
  open(); fireEvent.change(screen.getByLabelText('First name *'), { target: { value: 'Fictional' } });
  fireEvent.change(screen.getByLabelText('Estimated value · optional'), { target: { value: '1500.50' } });
  fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD', estimatedValue: 1500.5 })));
});
it('keeps the entered data when saving fails', async () => {
  create.mockRejectedValue(new Error('Server unavailable')); open();
  fireEvent.change(screen.getByLabelText('First name *'), { target: { value: 'Fictional' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));
  expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
  expect(screen.getByLabelText('First name *')).toHaveValue('Fictional');
});
it('prefills the WhatsApp name and phone, and includes the conversation when saving', async () => {
  render(<ConversationDealAction conversation={{ id: 'chat', channel: 'WHATSAPP', externalThreadId: '447700900123@s.whatsapp.net', whatsappContactName: 'Fictional Person', whatsappSessionId: 'user:staff', assignedTo: { id: 'staff' }, lead: null, patient: null } as any} />);
  fireEvent.click(screen.getByText('Add deal'));
  expect(screen.getByLabelText('First name *')).toHaveValue('Fictional');
  expect(screen.getByLabelText('Phone number')).toHaveValue('+447700900123');
  fireEvent.click(screen.getByRole('button', { name: 'Create deal' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'chat', source: 'WHATSAPP', whatsappNumber: '+447700900123' })));
});
it('opens an existing deal instead of offering creation', () => {
  render(<ConversationDealAction conversation={{ lead: { id: 'existing' } } as any} />);
  expect(screen.getByRole('link', { name: 'Open deal' })).toHaveAttribute('href', '/pipeline?leadId=existing');
});

it('searches and selects countries inside the form without losing keyboard focus', async () => {
  open(); fireEvent.click(screen.getByRole('combobox', { name: 'Country of residence' }));
  const search = screen.getByRole('searchbox', { name: 'Search countries' });
  await waitFor(() => expect(search).toHaveFocus());
  fireEvent.change(search, { target: { value: 'Lebanon' } });
  expect(screen.getByRole('option', { name: 'Lebanon · LB' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Afghanistan · AF' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('listbox', { name: 'Country results' }), { target: { value: 'LB' } });
  expect(screen.getByRole('combobox', { name: 'Country of residence' })).toHaveTextContent('Lebanon · LB');
});
