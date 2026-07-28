import { ALL_TEETH, PLAN_CONDITIONS, buildTooth, type ToothCondition } from '@dental-crm/shared';

// The chart is the one place a patient sees what is actually being proposed, and it is drawn from
// these ops in two renderers that never compare notes — DOM SVG in the browser and @react-pdf in
// the dossier. A condition that produces nothing is invisible in both: somebody buying a sinus
// lift looked at an unchanged mouth and had no way to tell the chart had ignored it.

/** Every op that carries geometry, flattened to the numbers inside it. */
function numbersIn(op: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const [key, value] of Object.entries(op)) {
    if (typeof value === 'number') out.push(value);
    if (key === 'd' && typeof value === 'string') {
      for (const m of value.match(/-?\d+(\.\d+)?/g) ?? []) out.push(Number(m));
    }
  }
  return out;
}

describe('buildTooth', () => {
  it('draws something for every condition a plan can propose', () => {
    // A silent condition is worse than a wrong one: nothing on screen reads as "nothing planned".
    for (const condition of PLAN_CONDITIONS) {
      const { subgingival, supragingival } = buildTooth('16', condition, 'plan');
      const total = subgingival.length + supragingival.length;
      // Extraction is the exception — it is drawn as a cross beside the tooth by buildToothMarker,
      // so the tooth itself is still an ordinary tooth.
      if (condition === 'EXTRACTION') continue;
      expect(`${condition}: ${total} ops`).not.toBe(`${condition}: 0 ops`);
    }
  });

  it('draws bone grafts, sinus lifts and bone loss under the gum, not on the crown', () => {
    // All three are bone. Drawn above the gum they would sit on top of the tooth, which is both
    // wrong and unreadable.
    for (const condition of ['BONE_GRAFT', 'SINUS_LIFT', 'RECEDING_BONE'] as ToothCondition[]) {
      const plain = buildTooth('16', 'HEALTHY', 'diagnosis');
      const marked = buildTooth('16', condition, 'diagnosis');
      expect(marked.subgingival.length).toBeGreaterThan(plain.subgingival.length);
    }
  });

  it('never emits NaN into path data', () => {
    // A single NaN silently voids the whole path, so the tooth vanishes rather than drawing wrong.
    for (const fdi of ALL_TEETH) {
      for (const condition of PLAN_CONDITIONS) {
        for (const mode of ['plan', 'diagnosis'] as const) {
          const { subgingival, supragingival } = buildTooth(fdi, condition, mode);
          for (const op of [...subgingival, ...supragingival]) {
            for (const n of numbersIn(op as Record<string, unknown>)) {
              expect(`${fdi}/${condition}/${mode}: ${n}`).not.toContain('NaN');
            }
          }
        }
      }
    }
  });

  it('gives a missing tooth nothing to draw, so the gap reads as a gap', () => {
    const { subgingival, supragingival } = buildTooth('16', 'MISSING', 'diagnosis');
    expect(subgingival).toHaveLength(0);
    expect(supragingival).toHaveLength(0);
  });

  it('keeps the crown on an implant, because an implant is restored with one', () => {
    const { subgingival, supragingival } = buildTooth('16', 'IMPLANT', 'plan');
    expect(subgingival.length).toBeGreaterThan(0);
    expect(supragingival.length).toBeGreaterThan(0);
  });
});
