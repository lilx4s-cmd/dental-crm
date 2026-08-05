'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { LeadCard } from './lead-card';
import type { Lead } from '@/hooks/use-leads';

/**
 * A pipeline column's cards, rendering only the ones on screen.
 *
 * The board mounted every lead as a DOM node. That is 969 active deals today with **811 of them in
 * NEW_DEAL alone** — one column carrying 84% of the board — and it is the most-used screen in the
 * product, so it is also the one whose performance degrades as the clinic succeeds.
 *
 * Two things make this harder than a plain virtual list, and both are about drag-and-drop:
 *
 * 1. **The dragged card must never unmount.** dnd-kit tracks the active node; if virtualization
 *    recycles it mid-drag — which is exactly what happens when you drag toward a column edge and
 *    the list scrolls — the drag dies and the card snaps back. So the active id is forced into the
 *    rendered set whatever the window says.
 *
 * 2. **SortableContext still needs every id.** It uses the list to work out where a drop lands, so
 *    passing only the visible ids would make a drop past the window edge resolve to the wrong
 *    position. Ids are strings; holding a thousand of them costs nothing. Only the *cards* are
 *    windowed.
 *
 * Heights are measured rather than assumed: a card is taller with a phone number, an email, tags
 * or a value on it, and a fixed estimate would drift the scrollbar badly over 811 rows.
 */
export function VirtualCardList({
  leads,
  activeId,
  onLeadClick,
}: {
  leads: Lead[];
  /** The card currently being dragged, if any. Kept mounted regardless of scroll position. */
  activeId: string | null;
  onLeadClick: (lead: Lead) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => scrollRef.current,
    // A card with a name, one contact line and a footer. Corrected by measureElement as each row
    // mounts, so this only has to be close enough for the first paint.
    estimateSize: () => 96,
    // Enough rows either side that a fast scroll does not show empty space, and few enough that
    // the DOM stays small. Five is roughly half a screen at this card size.
    overscan: 5,
    getItemKey: (index) => leads[index].id,
  });

  const items = virtualizer.getVirtualItems();

  // The dragged card, if the window has scrolled away from it. Rendered outside the virtual
  // positioning so dnd-kit keeps its node; the drag overlay is what the user actually sees, so it
  // being off-position here does not matter.
  const activeIndex = activeId ? leads.findIndex((l) => l.id === activeId) : -1;
  const activeOutsideWindow =
    activeIndex >= 0 && !items.some((item) => item.index === activeIndex) ? leads[activeIndex] : null;

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-1">
      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {/* The gap the old `space-y-1.5` provided. Inside the measured element so the
                  virtualizer accounts for it — spacing applied outside would make every row
                  report 6px short and the scrollbar drift by a whole screen over 811 cards. */}
              <div className="pb-1.5">
                <LeadCard lead={leads[item.index]} onClick={() => onLeadClick(leads[item.index])} />
              </div>
            </div>
          ))}
        </div>

        {activeOutsideWindow && (
          <div className="pointer-events-none absolute opacity-0" aria-hidden>
            <LeadCard lead={activeOutsideWindow} onClick={() => undefined} />
          </div>
        )}
      </SortableContext>

      {leads.length === 0 && (
        <div className="rounded-[3px] border border-dashed border-bx-line px-2 py-6 text-center text-[11px] text-bx-muted">
          Drag deals here
        </div>
      )}
    </div>
  );
}
