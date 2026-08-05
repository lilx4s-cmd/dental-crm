import { dossierCopy, directionStyles, isRightToLeft } from '@dental-crm/shared';

/**
 * The pure half of the Arabic work. The render itself is not tested here and cannot be:
 * `@react-pdf/renderer` ships ESM, and this project's ts-jest runs CommonJS, so importing it into
 * a spec fails to parse. That is why the codebase has never had a PDF render test.
 *
 * The render is verified instead by `scripts/verify-arabic-pdf.ts`, which renders a document and
 * inspects the bytes — font embedded, no Helvetica fallback, text placed against the right margin.
 * Run it after any change to the dossier's fonts or layout.
 */

describe('dossier copy', () => {
  it('has every English string translated', () => {
    // A missing key would print `undefined` on a document a patient keeps.
    const en = dossierCopy('en');
    const ar = dossierCopy('ar');

    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(ar[key]).toBeTruthy();
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it('falls back to English for a language it does not have', () => {
    expect(dossierCopy('fr')).toEqual(dossierCopy('en'));
    expect(dossierCopy(null).treatmentPlan).toBe('Treatment Plan');
  });
});

describe('directionStyles', () => {
  it('mirrors the layout for Arabic', () => {
    // react-pdf accepts `direction: 'rtl'` and discards it — the stylesheet maps it to
    // processNoopValue. Shaping and within-line bidi are handled; block layout is not, so these
    // properties are the mirroring.
    const rtl = directionStyles('ar');
    expect(rtl.textAlign).toBe('right');
    expect(rtl.flexDirection).toBe('row-reverse');
    expect(rtl.isRtl).toBe(true);
  });

  it('leaves a left-to-right layout alone', () => {
    const ltr = directionStyles('en');
    expect(ltr.textAlign).toBe('left');
    expect(ltr.flexDirection).toBe('row');
  });

  it('knows which languages are right-to-left', () => {
    expect(isRightToLeft('ar')).toBe(true);
    expect(isRightToLeft('en')).toBe(false);
    expect(isRightToLeft(null)).toBe(false);
  });
});
