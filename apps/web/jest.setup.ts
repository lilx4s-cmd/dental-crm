import '@testing-library/jest-dom';

/**
 * jsdom does not implement `DOMRect`.
 *
 * Radix positions its floating panels — the context menu's submenus, the tag picker's popover —
 * through floating-ui, which constructs a `DOMRect` to describe the anchor. In a browser that
 * class is on `window`; in jsdom it simply is not there, and any test that opens a submenu dies
 * with `ReferenceError: DOMRect is not defined` before it can assert anything.
 *
 * Every value is zero, which is fine: these tests assert on what is in a menu, never on where it
 * was drawn. jsdom has no layout engine, so a more elaborate stub would be more convincing without
 * being any more truthful.
 */
if (typeof globalThis.DOMRect === 'undefined') {
  class DOMRectStub {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    get top() {
      return this.y;
    }
    get left() {
      return this.x;
    }
    get right() {
      return this.x + this.width;
    }
    get bottom() {
      return this.y + this.height;
    }
    static fromRect(rect?: { x?: number; y?: number; width?: number; height?: number }) {
      return new DOMRectStub(rect?.x, rect?.y, rect?.width, rect?.height);
    }
    toJSON() {
      return { ...this };
    }
  }
  globalThis.DOMRect = DOMRectStub as unknown as typeof DOMRect;
}
