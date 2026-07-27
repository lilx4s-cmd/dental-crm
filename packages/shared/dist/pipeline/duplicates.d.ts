/**
 * Shapes for the duplicate-number cleanup.
 *
 * Shared because the review screen has to describe exactly what the merge will do before anybody
 * presses the button — a preview built from a second idea of what a group looks like is a preview
 * that can mislead somebody into folding away a live deal.
 */
export interface DuplicateGroupLead {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    email: string | null;
    stage: string;
    status: string;
    estimatedValue: number | null;
    currency: string | null;
    createdAt: string;
    assignedTo: {
        id: string;
        firstName: string;
        lastName: string;
    } | null;
    /** Already became a patient. Never absorbed — that deal produced a treatment. */
    hasPatient: boolean;
    counts: {
        tasks: number;
        activities: number;
        conversations: number;
    };
}
export interface DuplicateGroup {
    /** The normalised number these deals share. */
    number: string;
    /**
     * More than one completed treatment, or more than one linked patient, on the same number. That
     * is a returning patient rather than a mistake — implants last year, crowns this year — and bulk
     * merge leaves these alone unless somebody says otherwise.
     */
    repeatTreatment: boolean;
    /** Furthest along the pipeline, most recently moved. Overridable per group. */
    suggestedSurvivorId: string;
    /** Ordered with the suggested survivor first. */
    leads: DuplicateGroupLead[];
}
export interface MergeDuplicatesResult {
    /** Deals folded into a survivor. */
    merged: number;
    /** Numbers that had at least one deal folded in. */
    groups: number;
    skipped: {
        number: string;
        reason: string;
    }[];
    dryRun: boolean;
}
//# sourceMappingURL=duplicates.d.ts.map