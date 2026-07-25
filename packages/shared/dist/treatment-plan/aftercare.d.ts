import { ToothCondition } from '../dental/tooth-conditions';
export interface AftercareSection {
    /** The procedure this covers. */
    condition: ToothCondition;
    title: string;
    /** What the appointment itself involves, so the patient is not surprised on the day. */
    whatToExpect: string;
    /** Ordered so the most time-critical instruction is first. */
    aftercare: string[];
    /** Symptoms that mean "contact the clinic", not "wait and see". */
    warningSigns?: string[];
}
export declare const AFTERCARE_SECTIONS: AftercareSection[];
/** The guidance relevant to one plan, in the order the sections are defined. */
export declare function aftercareFor(conditions: Iterable<ToothCondition>): AftercareSection[];
/** Advice that applies to any patient travelling for treatment, printed on every dossier. */
export declare const TRAVEL_GUIDANCE: {
    readonly beforeYouTravel: readonly ["Bring your passport, travel insurance details, and a list of any medication you take regularly.", "Tell us in advance about heart conditions, diabetes, blood thinners, bisphosphonates, or pregnancy — several of these change how treatment is planned.", "Arrange travel insurance that covers you for a planned medical trip; ordinary holiday cover often does not.", "Do not start a course of treatment elsewhere in the weeks before you travel unless we have agreed it."];
    readonly duringYourStay: readonly ["Keep the clinic number and your coordinator’s number saved in your phone.", "Come to surgical appointments having eaten normally unless you were told otherwise.", "Arrange for a companion to be with you after any sedation — you must not travel alone afterwards.", "Avoid alcohol while you are taking antibiotics or painkillers."];
    readonly beforeYouFly: readonly ["Do not book a return flight for the same day as surgery. Allow the recovery time your plan sets out.", "After a sinus lift or upper jaw surgery, flying may need to be delayed — confirm the date with your surgeon before booking.", "Carry any prescribed medication in your hand luggage with its documentation.", "Ask for a written summary of what was done, so a dentist at home can treat you if needed."];
};
//# sourceMappingURL=aftercare.d.ts.map