import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LeadCardContextMenu } from './lead-card-context-menu';
import type { Lead } from '@/hooks/use-leads';

// Relative rather than `@/…`: jest.mock calls are hoisted above the module registry that resolves
// the alias, so an aliased path here is not found even though the same path works as an import.
jest.mock('../../hooks/use-reports', () => ({ useClinicSettings: () => ({ data: { clinicName: 'Kerem' } }) }));
jest.mock('../../context/auth-context', () => ({ useAuth: () => ({ accessToken: 't', user: null }) }));

function lead(id: string, over: Partial<Lead> = {}): Lead {
  return {
    id,
    firstName: 'Ahmed',
    lastName: 'Al-Rashid',
    email: 'a@example.com',
    phone: '905551234567',
    whatsappNumber: null,
    country: 'SA',
    source: 'FACEBOOK_ADS',
    stage: 'CONTACTED',
    status: 'ACTIVE',
    estimatedValue: null,
    currency: 'USD',
    lostReason: null,
    notes: null,
    bitrixDealId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stageChangedAt: new Date().toISOString(),
    assignedTo: null,
    tasks: [],
    campaign: null,
    patient: null,
    tags: [],
    ...over,
  } as Lead;
}

function open(target: Lead, selected: Lead[], handlers: Record<string, jest.Mock> = {}) {
  const onMoveToStage = handlers.onMoveToStage ?? jest.fn();
  const onChangeResponsible = handlers.onChangeResponsible ?? jest.fn();
  const onTag = handlers.onTag ?? jest.fn();
  const onOpen = handlers.onOpen ?? jest.fn();

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LeadCardContextMenu
        lead={target}
        selectedLeads={selected}
        onOpen={onOpen}
        onMoveToStage={onMoveToStage}
        onChangeResponsible={onChangeResponsible}
        onTag={onTag}
      >
        <div data-testid="card">card</div>
      </LeadCardContextMenu>
    </QueryClientProvider>,
  );

  fireEvent.contextMenu(screen.getByTestId('card'));
  return { onMoveToStage, onChangeResponsible, onTag, onOpen };
}

/**
 * The one thing worth pinning down here is what "the target" means.
 *
 * Right-clicking a card that is part of a selection has to act on the selection, and right-clicking
 * one outside it has to act on the card alone — the behaviour of every file manager, and the
 * ambiguity that otherwise makes people stop trusting the menu. "Archive" meaning one deal or forty
 * depending on something invisible is worse than not having the item.
 */
describe('LeadCardContextMenu — what it acts on', () => {
  it('acts on the whole selection when the card is part of it', () => {
    const a = lead('a');
    const b = lead('b');
    const { onChangeResponsible } = open(a, [a, b]);

    fireEvent.click(screen.getByText(/Change responsible/));

    expect(onChangeResponsible).toHaveBeenCalledWith([a, b]);
  });

  it('acts on the card alone when it is outside the selection', () => {
    const a = lead('a');
    const b = lead('b');
    const c = lead('c');
    const { onChangeResponsible } = open(c, [a, b]);

    fireEvent.click(screen.getByText(/Change responsible/));

    expect(onChangeResponsible).toHaveBeenCalledWith([c]);
  });

  it('says how many it will affect', () => {
    // The count in the label is the whole defence against the ambiguity above.
    const a = lead('a');
    const b = lead('b');
    open(a, [a, b]);

    expect(screen.getByText('2 deals selected')).toBeInTheDocument();
    expect(screen.getByText(/Change responsible \(2\)/)).toBeInTheDocument();
  });

  it('names the deal when there is only one', () => {
    const a = lead('a');
    open(a, []);

    expect(screen.getByText('Ahmed Al-Rashid')).toBeInTheDocument();
    expect(screen.getByText('Change responsible')).toBeInTheDocument();
  });

  it('treats a single-card selection as a single card', () => {
    // Selecting one deal and right-clicking it should not read as a bulk action.
    const a = lead('a');
    open(a, [a]);
    expect(screen.getByText('Ahmed Al-Rashid')).toBeInTheDocument();
  });
});

describe('LeadCardContextMenu — contact actions', () => {
  it('offers them only for a single deal', () => {
    // There is no sensible meaning to "call forty people".
    const a = lead('a');
    const b = lead('b');
    open(a, [a, b]);

    expect(screen.queryByText(/^Call /)).not.toBeInTheDocument();
    expect(screen.queryByText('Open deal')).not.toBeInTheDocument();
  });

  it('offers a call link for a deal with a number', () => {
    const a = lead('a');
    open(a, []);

    const call = screen.getByText(/Call 905551234567/).closest('a');
    expect(call).toHaveAttribute('href', 'tel:905551234567');
  });

  it('omits what the deal does not have', () => {
    const a = lead('a', { phone: null, whatsappNumber: null, email: null });
    open(a, []);

    expect(screen.queryByText(/^Call /)).not.toBeInTheDocument();
    expect(screen.queryByText('Copy email')).not.toBeInTheDocument();
    // The deal is still openable, which is the item that never depends on data.
    expect(screen.getByText('Open deal')).toBeInTheDocument();
  });
});

describe('LeadCardContextMenu — moving stage', () => {
  it('does not offer the stage the deal is already in', async () => {
    const a = lead('a', { stage: 'CONTACTED' });
    open(a, []);

    fireEvent.click(screen.getByText(/Move to stage/));

    const contacted = await screen.findByText('Contacted');
    expect(contacted.closest('[role="menuitem"]')).toHaveAttribute('data-disabled');
  });

  it('does offer the stages the deal could move to', async () => {
    // The control for the two assertions either side: if `data-disabled` were simply always
    // present, or the selector never matched, those would pass against any implementation.
    const a = lead('a', { stage: 'CONTACTED' });
    open(a, []);

    fireEvent.click(screen.getByText(/Move to stage/));

    const negotiation = await screen.findByText('Negotiation');
    expect(negotiation.closest('[role="menuitem"]')).not.toHaveAttribute('data-disabled');
  });

  it('does not offer Lost, which needs a reason this menu cannot collect', async () => {
    const a = lead('a');
    open(a, []);

    fireEvent.click(screen.getByText(/Move to stage/));

    const lost = await screen.findByText('Lost');
    expect(lost.closest('[role="menuitem"]')).toHaveAttribute('data-disabled');
  });
});
