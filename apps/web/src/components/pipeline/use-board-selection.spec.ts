import { act, renderHook } from '@testing-library/react';

import { useBoardSelection } from './use-board-selection';
import type { Lead } from '../../hooks/use-leads';

const lead = (id: string, stage = 'NEW_DEAL') => ({ id, stage }) as unknown as Lead;

const column = [lead('a'), lead('b'), lead('c'), lead('d'), lead('e')];
const otherColumn = [lead('x', 'CONTACTED'), lead('y', 'CONTACTED')];

/** A click with the modifiers a real event would carry. */
const click = (over: Partial<React.MouseEvent> = {}) =>
  ({ ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: jest.fn(), ...over }) as React.MouseEvent;

describe('useBoardSelection', () => {
  it('leaves a plain click alone, so a card still opens', () => {
    // The board's primary action must survive. Selection is the exception, not the default.
    const { result } = renderHook(() => useBoardSelection());

    let handled = false;
    act(() => {
      handled = result.current.handleCardClick(column[0], column, click());
    });

    expect(handled).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('adds and removes one card with Ctrl or Cmd', () => {
    const { result } = renderHook(() => useBoardSelection());

    act(() => {
      result.current.handleCardClick(column[0], column, click({ ctrlKey: true }));
    });
    expect(result.current.isSelected('a')).toBe(true);

    act(() => {
      result.current.handleCardClick(column[0], column, click({ metaKey: true }));
    });
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('extends a range with Shift, in both directions', () => {
    const { result } = renderHook(() => useBoardSelection());

    act(() => {
      result.current.handleCardClick(column[1], column, click({ ctrlKey: true }));
    });
    act(() => {
      result.current.handleCardClick(column[3], column, click({ shiftKey: true }));
    });

    expect([...result.current.selected].sort()).toEqual(['b', 'c', 'd']);

    // Backwards from the same anchor.
    act(() => result.current.clear());
    act(() => {
      result.current.handleCardClick(column[3], column, click({ ctrlKey: true }));
    });
    act(() => {
      result.current.handleCardClick(column[1], column, click({ shiftKey: true }));
    });
    expect([...result.current.selected].sort()).toEqual(['b', 'c', 'd']);
  });

  it('does not extend a range across columns', () => {
    // A board is not one list. "Everything between here and there" has no meaning across two
    // separate stacks, and would select deals in stages that are not even on screen.
    const { result } = renderHook(() => useBoardSelection());

    act(() => {
      result.current.handleCardClick(column[0], column, click({ ctrlKey: true }));
    });
    act(() => {
      result.current.handleCardClick(otherColumn[1], otherColumn, click({ shiftKey: true }));
    });

    // Falls back to toggling the one card rather than inventing a cross-column range.
    expect([...result.current.selected].sort()).toEqual(['a', 'y']);
  });

  it('keeps a range in one column when another is picked elsewhere', () => {
    // Acting on the union across columns is the whole point of selecting across the board.
    const { result } = renderHook(() => useBoardSelection());

    act(() => {
      result.current.handleCardClick(column[0], column, click({ ctrlKey: true }));
    });
    act(() => {
      result.current.handleCardClick(column[2], column, click({ shiftKey: true }));
    });
    act(() => {
      result.current.handleCardClick(otherColumn[0], otherColumn, click({ ctrlKey: true }));
    });

    expect([...result.current.selected].sort()).toEqual(['a', 'b', 'c', 'x']);
  });

  it('stops the browser turning the board into selected text', () => {
    // Shift-clicking without this leaves the page looking highlighted and unresponsive.
    const { result } = renderHook(() => useBoardSelection());
    const event = click({ ctrlKey: true });

    act(() => {
      result.current.handleCardClick(column[0], column, event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('selects all and clears', () => {
    const { result } = renderHook(() => useBoardSelection());

    act(() => result.current.selectAll([...column, ...otherColumn]));
    expect(result.current.count).toBe(7);

    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it('resolves to leads in board order, not click order', () => {
    // The confirmation dialog lists them; listing them in the order they were clicked would read
    // as arbitrary next to the board.
    const { result } = renderHook(() => useBoardSelection());

    act(() => {
      result.current.handleCardClick(column[3], column, click({ ctrlKey: true }));
    });
    act(() => {
      result.current.handleCardClick(column[0], column, click({ ctrlKey: true }));
    });

    expect(result.current.resolve(column).map((l) => l.id)).toEqual(['a', 'd']);
  });
});
