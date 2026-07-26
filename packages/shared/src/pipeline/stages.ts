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
  /** Tailwind border colour for the board column. Identity, not status — each stage is distinct. */
  color: string;
  /** Asked for from this stage onward. */
  documents?: DealDocument[];
  /** Terminal stages sit at the end of the board and set Lead.status. */
  terminal?: 'won' | 'lost';
}

export const PIPELINE_STAGES: PipelineStageDef[] = [
  { id: 'NEW_DEAL', label: 'New Deal', color: 'border-indigo-400' },
  { id: 'NO_RESPONSE_1', label: 'No Response 1', color: 'border-slate-400' },
  { id: 'NO_RESPONSE_2', label: 'No Response 2', color: 'border-slate-500' },
  { id: 'NO_RESPONSE_3', label: 'No Response 3', color: 'border-slate-600' },
  { id: 'CONTACTED', label: 'Contacted', color: 'border-purple-400' },
  { id: 'WAITING_PHOTOS', label: 'Waiting Photos', color: 'border-fuchsia-400' },
  // From the consultation onward the dentist needs to see the mouth.
  { id: 'CONSULTATION', label: 'Consultation', color: 'border-blue-400', documents: ['TEETH_PHOTOS'] },
  { id: 'OFFER_SENT', label: 'Offer Sent', color: 'border-cyan-400', documents: ['TEETH_PHOTOS'] },
  { id: 'NEGOTIATION', label: 'Negotiation', color: 'border-teal-400', documents: ['TEETH_PHOTOS'] },
  { id: 'WAITING_FOR_TICKET', label: 'Waiting for Ticket', color: 'border-amber-400', documents: ['TEETH_PHOTOS'] },
  // Once travel is booked the clinic needs the documents to plan the stay and meet them.
  {
    id: 'TICKET',
    label: 'Ticket',
    color: 'border-orange-400',
    documents: ['TEETH_PHOTOS', 'PASSPORT', 'FLIGHT_TICKET'],
  },
  {
    id: 'SECOND_VISIT',
    label: 'Second Visit',
    color: 'border-lime-500',
    documents: ['TEETH_PHOTOS', 'PASSPORT', 'FLIGHT_TICKET'],
  },
  {
    id: 'DONE',
    label: 'Done',
    color: 'border-green-500',
    documents: ['TEETH_PHOTOS', 'PASSPORT', 'FLIGHT_TICKET'],
    terminal: 'won',
  },
  { id: 'LOST', label: 'Lost', color: 'border-red-400', terminal: 'lost' },
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
