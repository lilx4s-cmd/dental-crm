"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECYCLE_ANGLE = exports.TERMINAL_STAGES = exports.STAGE_CADENCE = void 0;
exports.nextAction = nextAction;
exports.dormantBefore = dormantBefore;
exports.longestDormancyDays = longestDormancyDays;
exports.STAGE_CADENCE = {
    // Speed matters most here: a new enquiry that waits a day has usually already booked elsewhere.
    NEW_DEAL: { action: 'Make first contact', chaseAfterDays: 1, dormantAfterDays: 14 },
    NO_RESPONSE_1: { action: 'Try again — second attempt', chaseAfterDays: 2, dormantAfterDays: 21 },
    NO_RESPONSE_2: { action: 'Try again — third attempt', chaseAfterDays: 4, dormantAfterDays: 30 },
    // Three failed attempts is the point to stop chasing daily and let the recycling queue have it.
    NO_RESPONSE_3: { action: 'Last attempt before parking', chaseAfterDays: 7, dormantAfterDays: 30 },
    CONTACTED: { action: 'Qualify — what do they want and when', chaseAfterDays: 2, dormantAfterDays: 30 },
    WAITING_PHOTOS: { action: 'Chase the photos', chaseAfterDays: 3, dormantAfterDays: 30 },
    CONSULTATION: { action: 'Get the dentist’s assessment back to them', chaseAfterDays: 2, dormantAfterDays: 30 },
    // The follow-up that decides most cases. A quote nobody follows up is a quote lost quietly.
    OFFER_SENT: { action: 'Follow up on the offer', chaseAfterDays: 3, dormantAfterDays: 30 },
    NEGOTIATION: { action: 'Close, or find the objection', chaseAfterDays: 2, dormantAfterDays: 30 },
    WAITING_FOR_TICKET: { action: 'Check whether they have booked flights', chaseAfterDays: 5, dormantAfterDays: 45 },
    // Travel is booked. Keep warm rather than chase — pressure here loses trust, not deals.
    TICKET: { action: 'Confirm arrival details and transfer', chaseAfterDays: 7, dormantAfterDays: 60 },
    SECOND_VISIT: { action: 'Arrange the second visit', chaseAfterDays: 14, dormantAfterDays: 90 },
};
/** Stages that are finished. Nothing here is ever chased or recycled. */
exports.TERMINAL_STAGES = ['DONE', 'LOST'];
const DAY_MS = 86_400_000;
const wholeDaysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / DAY_MS);
/**
 * What this deal needs next, and how badly.
 *
 * Measured from the last stage change rather than from creation: a deal that moved yesterday is
 * being worked, however old it is. Using age would put every long-running case permanently at the
 * top of the list and train people to ignore it.
 */
function nextAction(stage, stageChangedAt, now = new Date()) {
    if (exports.TERMINAL_STAGES.includes(stage)) {
        return { action: null, dueAt: null, urgency: 'none', overdueDays: 0, dormant: false };
    }
    const cadence = exports.STAGE_CADENCE[stage];
    if (!cadence) {
        return { action: null, dueAt: null, urgency: 'none', overdueDays: 0, dormant: false };
    }
    const since = new Date(stageChangedAt);
    const dueAt = new Date(since.getTime() + cadence.chaseAfterDays * DAY_MS);
    const idleDays = wholeDaysBetween(now, since);
    const dormant = idleDays >= cadence.dormantAfterDays;
    // A dormant deal is not "very overdue" — it is a different job, done in batches with a different
    // message, so it leaves the daily list entirely rather than sitting at the top of it forever.
    if (dormant) {
        return { action: cadence.action, dueAt, urgency: 'none', overdueDays: idleDays, dormant: true };
    }
    const overdueDays = Math.max(0, wholeDaysBetween(now, dueAt));
    const urgency = now >= dueAt ? (overdueDays > 0 ? 'overdue' : 'due') : 'later';
    return { action: cadence.action, dueAt, urgency, overdueDays, dormant: false };
}
/** The cutoff a deal's stageChangedAt must precede to be dormant in the given stage. */
function dormantBefore(stage, now = new Date()) {
    const cadence = exports.STAGE_CADENCE[stage];
    if (!cadence)
        return null;
    return new Date(now.getTime() - cadence.dormantAfterDays * DAY_MS);
}
/** Longest dormancy across all stages — a cheap pre-filter before checking each deal properly. */
function longestDormancyDays() {
    return Math.max(...Object.values(exports.STAGE_CADENCE).map((c) => c.dormantAfterDays));
}
/**
 * What to say, per stage, when re-approaching a deal that went cold.
 *
 * A recycled deal cannot be chased with the same message as a live one — "just following up on my
 * last message" three months later reads as a form letter. These are the angle for the AI draft,
 * not the message itself.
 */
exports.RECYCLE_ANGLE = {
    NEW_DEAL: 'Never reached them at all — re-introduce the clinic briefly, no assumptions.',
    NO_RESPONSE_1: 'Never got a reply — try a different channel and keep it very short.',
    NO_RESPONSE_2: 'Never got a reply — try a different channel and keep it very short.',
    NO_RESPONSE_3: 'Gave up after three attempts — one last light touch, easy to ignore or revive.',
    CONTACTED: 'Spoke once and it stalled — ask whether their plans changed.',
    WAITING_PHOTOS: 'Photos never arrived — offer to help, or offer a video call instead.',
    CONSULTATION: 'Assessment done but nothing since — check what put them off.',
    OFFER_SENT: 'Had a quote and went quiet — ask directly whether price or timing was the issue.',
    NEGOTIATION: 'Was negotiating and stopped — ask what would need to change.',
    WAITING_FOR_TICKET: 'Never booked travel — ask whether dates are still realistic.',
    TICKET: 'Booked but nothing since — confirm the trip is still happening.',
    SECOND_VISIT: 'Second visit never arranged — check whether they still want it.',
};
//# sourceMappingURL=next-action.js.map