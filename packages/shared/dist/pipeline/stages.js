"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AFTERCARE_FROM_STAGE = exports.STAGE_LABELS = exports.PIPELINE_STAGES = exports.DEAL_DOCUMENT_LABELS = exports.DealDocument = void 0;
exports.stageDef = stageDef;
exports.documentsExpectedAt = documentsExpectedAt;
exports.stageProgress = stageProgress;
// The clinic's sales process, in order, with the paperwork each step expects.
//
// Defined once because five surfaces read it — the board, the filter bar, the deal detail sheet,
// the dashboard and the reports charts — and they were previously each carrying their own copy of
// the labels. A stage renamed in one place and not the others is how a board ends up disagreeing
// with its own report.
/** Documents a stage expects, so the deal view can ask for them instead of staff remembering to. */
exports.DealDocument = {
    TEETH_PHOTOS: 'TEETH_PHOTOS',
    PASSPORT: 'PASSPORT',
    FLIGHT_TICKET: 'FLIGHT_TICKET',
};
exports.DEAL_DOCUMENT_LABELS = {
    TEETH_PHOTOS: 'Photos of the teeth',
    PASSPORT: 'Passport',
    FLIGHT_TICKET: 'Flight ticket',
};
// The ramp runs cool → warm → green the way a Bitrix funnel does: blues while the deal is still
// conversation, turquoise once an offer exists, amber once travel is being booked, then Bitrix's
// own won-green and lost-red at the end. The three "no response" stages deliberately drain of
// colour as they escalate, so a column full of grey reads as neglected at a glance.
exports.PIPELINE_STAGES = [
    { id: 'NEW_DEAL', label: 'New Deal', color: '#00C4FB' },
    { id: 'NO_RESPONSE_1', label: 'No Response 1', color: '#ADE2FF' },
    { id: 'NO_RESPONSE_2', label: 'No Response 2', color: '#C5CFD6' },
    { id: 'NO_RESPONSE_3', label: 'No Response 3', color: '#A5B2BD' },
    { id: 'CONTACTED', label: 'Contacted', color: '#39A8EF' },
    { id: 'WAITING_PHOTOS', label: 'Waiting Photos', color: '#DF9CD5' },
    // From the consultation onward the dentist needs to see the mouth.
    { id: 'CONSULTATION', label: 'Consultation', color: '#2FC6F6', documents: ['TEETH_PHOTOS'] },
    { id: 'OFFER_SENT', label: 'Offer Sent', color: '#55D0E0', documents: ['TEETH_PHOTOS'] },
    { id: 'NEGOTIATION', label: 'Negotiation', color: '#47E4C2', documents: ['TEETH_PHOTOS'] },
    { id: 'WAITING_FOR_TICKET', label: 'Waiting for Ticket', color: '#FFB800', documents: ['TEETH_PHOTOS'] },
    // Once travel is booked the clinic needs the documents to plan the stay and meet them.
    {
        id: 'TICKET',
        label: 'Ticket',
        color: '#FFA900',
        documents: ['TEETH_PHOTOS', 'PASSPORT', 'FLIGHT_TICKET'],
    },
    {
        id: 'SECOND_VISIT',
        label: 'Second Visit',
        color: '#F7A700',
        documents: ['TEETH_PHOTOS', 'PASSPORT', 'FLIGHT_TICKET'],
    },
    {
        id: 'DONE',
        label: 'Done',
        color: '#7BD500',
        documents: ['TEETH_PHOTOS', 'PASSPORT', 'FLIGHT_TICKET'],
        terminal: 'won',
    },
    { id: 'LOST', label: 'Lost', color: '#FF5752', terminal: 'lost' },
];
exports.STAGE_LABELS = Object.fromEntries(exports.PIPELINE_STAGES.map((s) => [s.id, s.label]));
function stageDef(stage) {
    return exports.PIPELINE_STAGES.find((s) => s.id === stage);
}
/** Which documents a deal at this stage should already have on file. */
function documentsExpectedAt(stage) {
    return stageDef(stage)?.documents ?? [];
}
/** A deal reaching DONE has been treated, so the patient moves into after-care. */
exports.AFTERCARE_FROM_STAGE = 'DONE';
/**
 * How far along a deal is, used to choose which of several duplicates to keep.
 *
 * The stage list is already in pipeline order, so its index is the answer everywhere except Lost:
 * that sits at the end of the board because it is where cards go, not because it is the furthest a
 * deal can get. Ranking it below New Deal keeps a dead enquiry from swallowing a live one.
 */
function stageProgress(stage) {
    const index = exports.PIPELINE_STAGES.findIndex((s) => s.id === stage);
    if (index === -1)
        return -1;
    return exports.PIPELINE_STAGES[index].terminal === 'lost' ? -1 : index;
}
//# sourceMappingURL=stages.js.map