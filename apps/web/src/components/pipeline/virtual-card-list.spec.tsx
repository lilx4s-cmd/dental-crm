import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

import { VirtualCardList } from './virtual-card-list';
import type { Lead } from '../../hooks/use-leads';

// LeadCard reaches for clinic settings to build its WhatsApp link. Stubbed rather than wrapped in
// providers: what is under test is how many cards mount, not what is on them.
jest.mock('../../hooks/use-reports', () => ({
  useClinicSettings: () => ({ data: { clinicName: 'Kerem Clinic' } }),
}));
jest.mock('../../hooks/use-leads', () => ({
  useUpdateLeadTask: () => ({ mutate: jest.fn(), isPending: false }),
}));

/**
 * jsdom performs no layout, so every element reports a height of zero — and a virtualizer told its
 * viewport is 0px high correctly renders nothing at all. Without this the tests below would pass
 * while proving nothing: "fewer than 811 cards" is trivially true of zero.
 *
 * Giving the scroll element a real height makes the windowing actually run.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 252 });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 252, height: 96, top: 0, left: 0, bottom: 96, right: 252, x: 0, y: 0, toJSON: () => ({}) };
  };
});

/**
 * The board mounted every lead as a DOM node. Production carries 969 active deals with **811 in
 * NEW_DEAL alone** — one column holding 84% of the board — on the most-used screen in the product.
 *
 * What these prove is the property that matters and can be checked without a browser: that the
 * number of cards in the DOM does not grow with the number of leads. Scroll smoothness and drag
 * latency are the actual goal and are not measurable here; this is the mechanism underneath them.
 */

function leadsFixture(count: number): Lead[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `lead-${i}`,
    firstName: `Patient${i}`,
    lastName: 'Test',
    email: null,
    phone: '+905551234567',
    whatsappNumber: null,
    country: 'TR',
    source: 'FACEBOOK_ADS',
    stage: 'NEW_DEAL',
    status: 'ACTIVE',
    estimatedValue: 1000,
    currency: 'USD',
    lostReason: null,
    notes: null,
    bitrixDealId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })) as unknown as Lead[];
}

/** Nothing selected. These tests are about how many cards mount, not about selection. */
const noSelection = {
  selected: new Set<string>(),
  count: 0,
  isSelected: () => false,
  handleCardClick: () => false,
  selectAll: () => undefined,
  clear: () => undefined,
  resolve: () => [],
};

/** dnd-kit's sortable hooks need a DndContext above them. */
function renderList(leads: Lead[], activeId: string | null = null) {
  return render(
    <DndContext>
      <VirtualCardList
        leads={leads}
        activeId={activeId}
        selection={noSelection}
        onLeadClick={() => undefined}
      />
    </DndContext>,
  );
}

const cardCount = (container: HTMLElement) => container.querySelectorAll('[data-index]').length;

describe('VirtualCardList', () => {
  it('does not mount a card per lead', () => {
    // The whole point. 811 leads must not become 811 nodes.
    const { container } = renderList(leadsFixture(811));
    expect(cardCount(container)).toBeLessThan(811);
  });

  it('renders roughly the same number of cards for 50 leads as for 800', () => {
    // The property that makes this scale: DOM size is bounded by the window, not by the data. If
    // these diverged, virtualization would not be doing anything.
    const small = renderList(leadsFixture(50));
    const smallCount = cardCount(small.container);
    small.unmount();

    const large = renderList(leadsFixture(800));
    const largeCount = cardCount(large.container);

    expect(Math.abs(largeCount - smallCount)).toBeLessThanOrEqual(5);
  });

  it('reserves the full scroll height so the scrollbar is honest', () => {
    // Without this the column would look like it holds a handful of deals. jsdom does no layout,
    // so the height comes from the virtualizer's own total rather than from measurement.
    const { container } = renderList(leadsFixture(811));
    const spacer = container.querySelector('.relative.w-full') as HTMLElement | null;
    expect(spacer?.style.height).toBeTruthy();
  });

  it('keeps the dragged card mounted even when it is outside the window', () => {
    // dnd-kit tracks the active node. Recycling it mid-drag — exactly what happens when you drag
    // toward a column edge and the list scrolls — kills the drag and snaps the card back.
    const leads = leadsFixture(800);
    const farAway = leads[700];

    renderList(leads, farAway.id);

    expect(screen.getAllByText(new RegExp(farAway.firstName)).length).toBeGreaterThan(0);
  });

  it('does not duplicate the dragged card when it is already visible', () => {
    // The off-window copy is a fallback, not a second render.
    const leads = leadsFixture(800);
    renderList(leads, leads[0].id);

    expect(screen.getAllByText(new RegExp(`^${leads[0].firstName}\\b`)).length).toBe(1);
  });

  it('shows the drop hint for an empty column', () => {
    const { container } = renderList([]);
    expect(screen.getByText(/drag deals here/i)).toBeInTheDocument();
    expect(cardCount(container)).toBe(0);
  });
});
