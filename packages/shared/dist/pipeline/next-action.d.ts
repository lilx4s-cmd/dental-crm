import { PipelineStage } from '../enums';
export interface StageCadence {
    /** What the salesperson is actually chasing. Shown verbatim on the work list. */
    action: string;
    /** Days after landing in this stage before it needs chasing. */
    chaseAfterDays: number;
    /** Days of silence after which the deal is cold and belongs in the recycling queue. */
    dormantAfterDays: number;
}
export declare const STAGE_CADENCE: Record<string, StageCadence>;
/** Stages that are finished. Nothing here is ever chased or recycled. */
export declare const TERMINAL_STAGES: PipelineStage[];
export type ActionUrgency = 'overdue' | 'due' | 'later' | 'none';
export interface NextAction {
    action: string | null;
    /** When the chase became, or becomes, due. */
    dueAt: Date | null;
    urgency: ActionUrgency;
    /** Whole days past due. Zero unless overdue — used to sort the worst offenders first. */
    overdueDays: number;
    /** Cold enough to belong in the recycling queue rather than today's calls. */
    dormant: boolean;
}
/**
 * What this deal needs next, and how badly.
 *
 * Measured from the last stage change rather than from creation: a deal that moved yesterday is
 * being worked, however old it is. Using age would put every long-running case permanently at the
 * top of the list and train people to ignore it.
 */
export declare function nextAction(stage: string, stageChangedAt: Date | string, now?: Date): NextAction;
/** The cutoff a deal's stageChangedAt must precede to be dormant in the given stage. */
export declare function dormantBefore(stage: string, now?: Date): Date | null;
/** Longest dormancy across all stages — a cheap pre-filter before checking each deal properly. */
export declare function longestDormancyDays(): number;
/**
 * What to say, per stage, when re-approaching a deal that went cold.
 *
 * A recycled deal cannot be chased with the same message as a live one — "just following up on my
 * last message" three months later reads as a form letter. These are the angle for the AI draft,
 * not the message itself.
 */
export declare const RECYCLE_ANGLE: Record<string, string>;
//# sourceMappingURL=next-action.d.ts.map