/** How many days without a stage change before a lead counts as going nowhere. */
export declare const STUCK_LEAD_DAYS = 14;
export declare const TaskDueFilter: {
    readonly OVERDUE: "overdue";
    readonly TODAY: "today";
    readonly WEEK: "week";
    readonly MONTH: "month";
    readonly NONE: "none";
};
export type TaskDueFilter = (typeof TaskDueFilter)[keyof typeof TaskDueFilter];
export declare const TASK_DUE_LABELS: Record<TaskDueFilter, string>;
/** Every field the filter bar can filter on. Drives the "Add field" picker and the chip labels. */
export declare const PIPELINE_FILTER_FIELDS: readonly [{
    readonly key: "search";
    readonly label: "Patient";
    readonly hint: "Name, email or phone";
}, {
    readonly key: "assignedToId";
    readonly label: "Responsible person";
}, {
    readonly key: "stage";
    readonly label: "Stage";
}, {
    readonly key: "taskDue";
    readonly label: "Task due";
}, {
    readonly key: "source";
    readonly label: "Source";
}, {
    readonly key: "stuck";
    readonly label: "No movement";
}];
export type PipelineFilterKey = (typeof PIPELINE_FILTER_FIELDS)[number]['key'];
/** Which fields the filter form shows before anyone customises it. */
export declare const DEFAULT_PIPELINE_FILTER_FIELDS: PipelineFilterKey[];
export interface DateRange {
    gte?: Date;
    lt?: Date;
}
/**
 * The window a task due-date filter covers, resolved against `now`.
 *
 * "This week" and "this month" run from *now* to the end of the period rather than from its start —
 * someone asking what is due this week wants what is still ahead of them, and anything already past
 * belongs under Overdue instead of being counted twice. Weeks end Sunday (ISO), which matches how
 * the clinic's rota reads.
 *
 * `overdue` and `none` have no range; callers handle those as separate cases.
 */
export declare function taskDueRange(filter: TaskDueFilter, now?: Date): DateRange | null;
/** The cutoff a lead's stageChangedAt must precede to count as stuck. */
export declare function stuckBefore(now?: Date): Date;
//# sourceMappingURL=filters.d.ts.map