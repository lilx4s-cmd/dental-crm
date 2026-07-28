import { ToothCondition } from '../dental/tooth-conditions';

/**
 * What the patient is actually buying, written to sell rather than to teach.
 *
 * The dossier already explains recovery in the aftercare pages. What it never did was say why any
 * of this is worth flying to Istanbul for — the price table listed "Zirconia crown · 220 EUR" and
 * left the patient to work out for themselves whether that was good. Somebody comparing three
 * clinics on price alone has no reason to choose this one.
 *
 * Rules this copy follows, because a medical document that oversells is worse than one that
 * undersells:
 *
 * - Every claim is a property of the material or the method, not a promise about the outcome.
 *   "Zirconia contains no metal" is checkable. "You will love your new smile" is not.
 * - No numbers that the clinic cannot stand behind. Success rates and lifespans vary by patient
 *   and by case; quoting an average as if it were a guarantee is how a happy patient becomes a
 *   complaint.
 * - Nothing here contradicts the aftercare section. If the aftercare says smoking causes implant
 *   failure, the sales copy does not claim implants always last.
 *
 * Keyed on the condition rather than on brand because brand is optional and, in this clinic's data,
 * almost never filled in — three plan items on file and not one brand recorded. When somebody does
 * record one, `brandLine` folds it in as an extra sentence rather than the copy depending on it.
 */

export interface ValueProp {
  condition: ToothCondition;
  /** Headline the patient reads first. Names the thing, not the category. */
  title: string;
  /** One paragraph. What it is and why it is the right answer. */
  pitch: string;
  /** Short, concrete, scannable. The reasons somebody chooses this over the cheap version. */
  points: string[];
}

export const VALUE_PROPS: ValueProp[] = [
  {
    condition: 'IMPLANT',
    title: 'Dental implants — a replacement that stands on its own',
    pitch:
      'An implant is a titanium root placed into the jawbone, carrying its own crown. Unlike a bridge it does not lean on the teeth either side, so healthy teeth stay untouched, and unlike a denture it is fixed — you eat, speak and laugh without thinking about it. The bone grows onto the surface of the titanium and holds it the way it held the original root.',
    points: [
      'Nothing is ground down. Neighbouring teeth are left exactly as they are.',
      'The bone around the socket keeps its shape, because the implant loads it the way a natural root does.',
      'Titanium is accepted by the body — it is the same material used in hip and knee replacements.',
      'Fixed in place. It does not come out to be cleaned and it does not move while you eat.',
    ],
  },
  {
    condition: 'CROWN',
    title: 'Zirconia crowns — the tooth rebuilt, not patched',
    pitch:
      'A crown covers the whole tooth rather than filling part of it, so a tooth that is cracked, heavily filled or root-treated is held together instead of being left to split. Zirconia is milled from a single block to a digital scan of your mouth, which is why it seats precisely and why the margin sits flush against the gum.',
    points: [
      'No metal, and no grey line at the gum as the years pass.',
      'Light passes through it the way it passes through enamel, so it does not read as a false tooth.',
      'Hard enough for molars, which is where cosmetic materials usually fail first.',
      'Milled to a digital scan, so the fit does not depend on how well an impression was poured.',
    ],
  },
  {
    condition: 'VENEER',
    title: 'Veneers — the front surface, redesigned',
    pitch:
      'A veneer is a thin facing bonded to the front of the tooth, changing its colour, shape and alignment while leaving the rest of the tooth alone. It is the conservative answer to a smile that looks worn, stained or uneven: far less of the tooth is removed than a crown would require.',
    points: [
      'Most of your own tooth is kept — this is the least destructive way to change how a front tooth looks.',
      'Colour is chosen against your own face and the teeth either side, not from a chart.',
      'Resists the coffee, tea and tobacco staining that discolours natural enamel.',
      'Shape and length are agreed before anything is prepared, so there is no surprise at the fit.',
    ],
  },
  {
    condition: 'BRIDGE',
    title: 'Bridges — a gap closed in a single visit sequence',
    pitch:
      'A bridge spans a missing tooth by anchoring to the teeth on either side, restoring the bite without surgery. Where the neighbouring teeth already need crowning, it is the efficient answer: one piece of work solves three problems at once.',
    points: [
      'No surgery and no healing period — the gap is closed within the treatment visit.',
      'Restores chewing on that side, which stops the opposite side taking all the load.',
      'Stops the teeth either side drifting into the gap and the bite collapsing.',
      'Made in the same zirconia as our crowns, so it matches the rest of the work.',
    ],
  },
  {
    condition: 'ROOT_CANAL',
    title: 'Root canal treatment — keeping the tooth you already have',
    pitch:
      'When infection reaches the nerve, the choice is to clean the canal out or to lose the tooth. Root canal treatment removes the infection and seals the space, so the tooth stays in your mouth and keeps doing its job. Kept under a crown afterwards, a treated tooth serves for many years.',
    points: [
      'Your own tooth root is kept, which is always better than the best replacement.',
      'Carried out under local anaesthetic — the procedure itself is not painful.',
      'Ends the infection rather than managing the pain it causes.',
      'Costs less, and takes less of your time, than extracting and then replacing the tooth.',
    ],
  },
  {
    condition: 'BONE_GRAFT',
    title: 'Bone grafting — building the foundation first',
    pitch:
      'Where a tooth has been missing for a while, the bone that used to hold it thins out. A graft rebuilds that ridge so an implant has something solid to sit in. It is the step that decides whether the implant is stable in ten years, which is why we would rather add it than place an implant into bone that cannot carry it.',
    points: [
      'Gives the implant a foundation instead of placing it into bone that has receded.',
      'Restores the shape of the gum line, so the finished tooth does not sit in a dip.',
      'Done at the same surgical visit wherever the case allows, rather than as a separate trip.',
    ],
  },
  {
    condition: 'SINUS_LIFT',
    title: 'Sinus lift — making room in the upper jaw',
    pitch:
      'In the upper back jaw the sinus often sits too low for an implant to be placed safely. A sinus lift raises that floor and packs bone beneath it, creating the height an implant needs. It is routine, planned from your CT scan, and it is what makes upper molar implants possible at all in many patients.',
    points: [
      'Makes implants possible where the answer would otherwise be a denture.',
      'Planned from your CT scan before you travel, so the surgical time is known in advance.',
      'Carried out under local anaesthetic, with sedation available.',
    ],
  },
  {
    condition: 'EXTRACTION',
    title: 'Extractions — done properly, with what comes next already planned',
    pitch:
      'A tooth that cannot be saved is removed as gently as the case allows, preserving the surrounding bone for whatever replaces it. The extraction is never the end of the plan: the replacement is decided before the tooth comes out, so you are not left with a gap and an open question.',
    points: [
      'The socket is preserved for the implant or bridge that follows.',
      'The replacement is agreed before the extraction, not afterwards.',
      'Local anaesthetic, with sedation available for anyone who would prefer it.',
    ],
  },
  {
    condition: 'FILLING',
    title: 'Composite fillings — repaired invisibly',
    pitch:
      'Decay is cleaned out and the tooth rebuilt in a composite matched to its own colour, bonded directly to the remaining tooth. Modern composite bonds to enamel rather than being wedged into a hole, so less healthy tooth has to be cut away to hold it.',
    points: [
      'Colour-matched, so the repair is not visible when you speak.',
      'Bonds to the tooth, so less healthy structure is removed than an amalgam filling needs.',
      'No mercury, and no dark shadow showing through the enamel over time.',
      'Finished and polished in the same appointment.',
    ],
  },
  {
    condition: 'CLEANING',
    title: 'Professional cleaning — the work that protects the rest',
    pitch:
      'Hardened deposits below the gum line cannot be brushed away, and they are what loosens teeth over time. A professional clean removes them and gives everything else in this plan a healthy mouth to sit in. It is the least expensive item here and the one that protects the value of all the others.',
    points: [
      'Removes what brushing cannot reach, above and below the gum line.',
      'Gum disease is the most common reason implants and crowns fail later.',
      'Leaves the surfaces smooth, so plaque takes longer to build up again.',
    ],
  },
];

/** The value propositions relevant to one plan, in the order they appear above. */
export function valuePropsFor(conditions: Iterable<ToothCondition>): ValueProp[] {
  const wanted = new Set<ToothCondition>();
  for (const c of conditions) {
    // A treated canal and a planned one sell the same way, as do the filling variants.
    if (c === 'ROOT_CANAL_TREATED') wanted.add('ROOT_CANAL');
    else if (c === 'AMALGAM_FILLING' || c === 'COMPOSITE_FILLING') wanted.add('FILLING');
    else wanted.add(c);
  }
  return VALUE_PROPS.filter((v) => wanted.has(v.condition));
}

/**
 * The extra sentence a recorded brand or material earns.
 *
 * Returns undefined when neither is on file, which is the common case today — the copy has to read
 * as finished without it, not as a sentence with a hole in it.
 */
export function brandLine(material?: string | null, brand?: string | null): string | undefined {
  const m = material?.trim();
  const b = brand?.trim();
  if (b && m) return `Supplied for your case in ${m} by ${b}.`;
  if (b) return `Supplied for your case by ${b}.`;
  if (m) return `Supplied for your case in ${m}.`;
  return undefined;
}
