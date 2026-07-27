import { PipelineStage } from '../enums';

// The clinic's sales process, in order, with the paperwork each step expects.
//
// Defined once because five surfaces read it — the board, the filter bar, the deal detail sheet,
// the dashboard and the reports charts — and they were previously each carrying their own copy of
// the labels. A stage renamed in one place and not the others is how a board ends up disagreeing
// with its own report.

/** Documents a stage expects, so the deal view can ask for them instead of staff remembering to. */
export const DealDocument = {
  TEETH_PHOTOS: 'TEETH_PHOTOS',
  PASSPORT: 'PASSPORT',
  FLIGHT_TICKET: 'FLIGHT_TICKET',
} as const;
export type DealDocument = (typeof DealDocument)[keyof typeof DealDocument];

export const DEAL_DOCUMENT_LABELS: Record<DealDocument, string> = {
  TEETH_PHOTOS: 'Photos of the teeth',
  PASSPORT: 'Passport',
  FLIGHT_TICKET: 'Flight ticket',
};

export interface PipelineStageDef {
  id: PipelineStage;
  label: string;
  /**
   * The stage's identity colour, as a hex value drawn from Bitrix24's kanban palette — the board
   * is a deliberate copy of the CRM the clinic used for years, and these are the colours staff
   * already read as "early / in progress / travelling / won / lost".
   *
   * Hex rather than a Tailwind class because the board paints it as a strip on the column header
   * and Tailwind cannot generate a class from a runtime value.
   */
  color: string;
  /** Asked for from this stage onward. */
  documents?: DealDocument[];
  /** Terminal stages sit at the end of the board and set Lead.status. */
  terminal?: 'won' | 'lost';
}

// The ramp runs cool → warm → green the way a Bitrix funnel does: blues while the deal is still
// conversation, turquoise once an offer exists, amber once travel is being booked, then Bitrix's
// own won-green and lost-red at the end. The three "no response" stages deliberately drain of
// colour as they escalate, so a column full of grey reads as neglected at a glance.
export const PIPELINE_STAGES: PipelineStageDef[] = [
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

export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.id, s.label]),
);

export function stageDef(stage: string): PipelineStageDef | undefined {
  return PIPELINE_STAGES.find((s) => s.id === stage);
}

/** Which documents a deal at this stage should already have on file. */
export function documentsExpectedAt(stage: string): DealDocument[] {
  return stageDef(stage)?.documents ?? [];
}

/** A deal reaching DONE has been treated, so the patient moves into after-care. */
export const AFTERCARE_FROM_STAGE: PipelineStage = 'DONE';
