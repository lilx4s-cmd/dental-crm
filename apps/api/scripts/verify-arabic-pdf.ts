/**
 * Verifies the Arabic dossier actually renders, by inspecting the bytes it produces.
 *
 * This exists as a script rather than a test because `@react-pdf/renderer` ships ESM and this
 * project's ts-jest runs CommonJS — importing the renderer into a spec fails to parse. That is why
 * the codebase has no PDF render tests at all.
 *
 * What it checks, and why each matters:
 *
 *   - **The font is embedded.** react-pdf draws a glyph the font does not have as *nothing* — not
 *     as a box. So an unregistered Arabic font produces a blank-looking page with no error, no
 *     warning, and nothing in the logs. This is the failure that would reach a patient.
 *   - **The English dossier does not carry it.** Embedding a font nobody needs adds ~430 kB to
 *     every plan the clinic sends.
 *   - **Text sits against the right margin.** `direction: 'rtl'` is accepted by react-pdf's
 *     stylesheet and then discarded (it maps to `processNoopValue`), so mirroring is done by hand
 *     and is exactly the thing that can regress unnoticed.
 *
 * Run: npx ts-node scripts/verify-arabic-pdf.ts
 */
import { renderToBuffer } from '@react-pdf/renderer';
import * as zlib from 'zlib';

import { TreatmentPlanDocument, type PlanDocumentInput } from '../src/pdf/treatment-plan-document';

const branding = { clinicName: 'Kerem Clinic', accent: '#183858' } as never;

function planIn(language: string): PlanDocumentInput {
  return {
    title: 'Full mouth rehabilitation',
    currency: 'USD',
    language,
    patient: { firstName: 'Ahmed', lastName: 'Al-Rashid' },
    items: [{ description: 'Zirconia crown', quantity: 4, cost: 2000, phaseNumber: 1 }],
    phases: [{ phaseNumber: 1, name: 'Prosthetics' }],
  } as unknown as PlanDocumentInput;
}

/**
 * Where text was actually placed.
 *
 * react-pdf does not position text with absolute `Td`; it emits a `cm` translation per block and
 * draws at a local origin, so the page coordinate is the translation, not the number beside the
 * text operator. It also uses `TJ` with kerning arrays rather than plain `Tj`.
 */
function textPositions(pdf: Buffer): number[] {
  const raw = pdf.toString('latin1');
  const xs: number[] = [];

  for (const stream of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = zlib.inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }

    let x = 0;
    const token = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm|\[[^\]]*\]\s*TJ/g;
    let match: RegExpExecArray | null;
    while ((match = token.exec(content)) !== null) {
      if (match[1] !== undefined) x = Number(match[5]);
      else if (x > 0) xs.push(x);
    }
  }
  return xs;
}

async function main() {
  const [arabic, english] = await Promise.all([
    renderToBuffer(TreatmentPlanDocument(planIn('ar'), branding) as never),
    renderToBuffer(TreatmentPlanDocument(planIn('en'), branding) as never),
  ]);

  const ar = arabic.toString('latin1');
  const checks: Array<[string, boolean]> = [
    ['Arabic font embedded', ar.includes('Amiri')],
    ['Arabic document differs from the English one', arabic.length !== english.length],
    ['English document does not carry the Arabic font', !english.toString('latin1').includes('Amiri')],
  ];

  // A4 is 595pt wide; 56pt margins leave a 483pt band. Right-aligned text starts in its far half.
  const xs = textPositions(arabic);
  const rightmost = xs.length ? Math.max(...xs) : 0;
  // Expected to fail until the pages are mirrored. `directionStyles` exists and is tested; it is
  // not yet applied to the nine page components, which is the remaining bulk of the work.
  checks.push(['text reaches the right margin (mirroring applied — NOT YET DONE)', rightmost > 300]);

  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}`);
    if (!ok) failed++;
  }
  console.log(`\ntext placements: ${xs.length}, rightmost x: ${rightmost.toFixed(1)} of 483`);

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Render failed:', error);
  process.exitCode = 1;
});
