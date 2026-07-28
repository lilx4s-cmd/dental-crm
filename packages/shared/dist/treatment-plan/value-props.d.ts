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
export declare const VALUE_PROPS: ValueProp[];
/** The value propositions relevant to one plan, in the order they appear above. */
export declare function valuePropsFor(conditions: Iterable<ToothCondition>): ValueProp[];
/**
 * The extra sentence a recorded brand or material earns.
 *
 * Returns undefined when neither is on file, which is the common case today — the copy has to read
 * as finished without it, not as a sentence with a hole in it.
 */
export declare function brandLine(material?: string | null, brand?: string | null): string | undefined;
//# sourceMappingURL=value-props.d.ts.map