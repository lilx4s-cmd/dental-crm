/**
 * The shared tag vocabulary, tested from the API rather than from `packages/shared`.
 *
 * That package has no test runner — a spec placed beside the source would never run, which is
 * worse than no spec. Importing through `@dental-crm/shared` also tests the built `dist` that both
 * apps actually consume, rather than the TypeScript source they never see.
 */
import {
  MAX_TAGS_PER_RECORD,
  normaliseTagName,
  TAG_CATEGORY_LABELS,
  TAG_CATEGORY_ORDER,
  TAG_COLORS,
  TAG_NAME_MAX,
  tagColorDef,
  TagCategory,
} from '@dental-crm/shared';

describe('tag names', () => {
  it('collapses runs of whitespace', () => {
    // Two people typing "Hollywood  Smile" and "Hollywood Smile" mean the same tag, and the
    // uniqueness check compares exact strings.
    expect(normaliseTagName('  Hollywood   Smile  ')).toBe('Hollywood Smile');
  });

  it('collapses newlines and tabs too', () => {
    expect(normaliseTagName('Waiting\ton\nfamily')).toBe('Waiting on family');
  });

  it('preserves case', () => {
    // Uniqueness is case-insensitive but display is not: a tag should look the way whoever created
    // it wrote it.
    expect(normaliseTagName('VIP')).toBe('VIP');
  });

  it('bounds the length', () => {
    expect(normaliseTagName('x'.repeat(200))).toHaveLength(TAG_NAME_MAX);
  });

  it('leaves nothing but whitespace as empty, so the caller can refuse it', () => {
    expect(normaliseTagName('   ')).toBe('');
  });
});

describe('the palette', () => {
  it('falls back rather than rendering an unstyled pill', () => {
    // An unknown colour — a value from a future migration, a hex string left over from the old
    // free-text column — should draw a plain pill, never one with no classes at all.
    expect(tagColorDef(null).id).toBe('SLATE');
    expect(tagColorDef('#3B82F6').id).toBe('SLATE');
    expect(tagColorDef('CHARTREUSE').id).toBe('SLATE');
  });

  it('resolves a known colour', () => {
    expect(tagColorDef('RED').id).toBe('RED');
  });

  it('styles both themes for every colour', () => {
    // A colour picked against the light theme is close to invisible on the dark one. Every entry
    // has to carry its dark variant or the tag disappears for half the staff.
    for (const c of TAG_COLORS) {
      expect(c.className).toContain('dark:');
      expect(c.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('writes class names literally, so Tailwind can find them', () => {
    // Tailwind scans source text. A class assembled at runtime is never generated, and the pill
    // renders with no styling at all — which looks like a data problem, not a build one.
    for (const c of TAG_COLORS) {
      expect(c.className).not.toMatch(/\$\{|\+/);
    }
  });
});

describe('categories', () => {
  it('orders every category exactly once', () => {
    const all = Object.values(TagCategory);
    expect([...TAG_CATEGORY_ORDER].sort()).toEqual([...all].sort());
  });

  it('labels every category', () => {
    for (const c of Object.values(TagCategory)) {
      expect(TAG_CATEGORY_LABELS[c]).toBeTruthy();
    }
  });

  it('puts the operational axes first', () => {
    // The picker and the settings list are both grouped in this order, and what a card is blocked
    // on matters more than which market it came from.
    expect(TAG_CATEGORY_ORDER[0]).toBe('HANDLING');
    expect(TAG_CATEGORY_ORDER.at(-1)).toBe('GENERAL');
  });
});

describe('the per-record cap', () => {
  it('is above what anyone uses and below what a card can show', () => {
    expect(MAX_TAGS_PER_RECORD).toBeGreaterThan(3);
    expect(MAX_TAGS_PER_RECORD).toBeLessThan(25);
  });
});
