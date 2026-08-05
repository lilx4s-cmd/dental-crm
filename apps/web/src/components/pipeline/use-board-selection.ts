'use client';

import { useCallback, useMemo, useState } from 'react';

import type { Lead } from '@/hooks/use-leads';

/**
 * Which deals are selected on the board, and the modifier rules for changing that.
 *
 * Kept as a hook rather than component state so the selection survives the board re-rendering
 * around it — a bulk reassignment refetches the columns, and losing the selection at that moment
 * would mean re-picking forty cards to do the second thing you wanted to do with them.
 *
 * The modifier behaviour follows the file-manager convention every user already has in their
 * fingers, because a bespoke one would have to be learned:
 *
 *   - plain click       → open the deal (selection untouched)
 *   - Ctrl/Cmd + click  → add or remove that one
 *   - Shift + click     → extend from the last one clicked, within its column
 *
 * Shift ranges are deliberately column-scoped. A board is not one list — extending a range across
 * a column boundary would select deals in stages the user cannot see on screen, and "select
 * everything between here and there" has no meaning across two separate stacks.
 */
export interface BoardSelection {
  readonly selected: ReadonlySet<string>;
  readonly count: number;
  isSelected: (id: string) => boolean;
  /** Returns true when the click was a selection gesture and the caller should not open the deal. */
  handleCardClick: (lead: Lead, columnLeads: Lead[], event: React.MouseEvent) => boolean;
  selectAll: (leads: Lead[]) => void;
  clear: () => void;
  /** The selected leads, in the order they appear on the board. */
  resolve: (allLeads: Lead[]) => Lead[];
}

export function useBoardSelection(): BoardSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // Where a Shift-range starts. Held per column, since ranges do not cross stacks.
  const [anchor, setAnchor] = useState<{ id: string; stage: string } | null>(null);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const handleCardClick = useCallback(
    (lead: Lead, columnLeads: Lead[], event: React.MouseEvent): boolean => {
      const additive = event.ctrlKey || event.metaKey;
      const ranged = event.shiftKey;

      if (!additive && !ranged) return false;

      // Both gestures would otherwise put the browser into text-selection mode, which leaves the
      // board looking highlighted and unresponsive.
      event.preventDefault();

      if (ranged && anchor && anchor.stage === lead.stage) {
        const from = columnLeads.findIndex((l) => l.id === anchor.id);
        const to = columnLeads.findIndex((l) => l.id === lead.id);
        if (from !== -1 && to !== -1) {
          const [start, end] = from <= to ? [from, to] : [to, from];
          const range = columnLeads.slice(start, end + 1).map((l) => l.id);
          // Adds rather than replaces, so a range in one column does not discard a range picked in
          // another — the whole point of selecting across the board is to act on the union.
          setSelected((prev) => new Set([...prev, ...range]));
          return true;
        }
      }

      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(lead.id)) next.delete(lead.id);
        else next.add(lead.id);
        return next;
      });
      setAnchor({ id: lead.id, stage: lead.stage });
      return true;
    },
    [anchor],
  );

  const selectAll = useCallback((leads: Lead[]) => {
    setSelected(new Set(leads.map((l) => l.id)));
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const resolve = useCallback(
    (allLeads: Lead[]) => allLeads.filter((l) => selected.has(l.id)),
    [selected],
  );

  return useMemo(
    () => ({ selected, count: selected.size, isSelected, handleCardClick, selectAll, clear, resolve }),
    [selected, isSelected, handleCardClick, selectAll, clear, resolve],
  );
}
