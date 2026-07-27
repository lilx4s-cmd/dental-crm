import { PipelineStage } from '../enums';
/** Documents a stage expects, so the deal view can ask for them instead of staff remembering to. */
export declare const DealDocument: {
    readonly TEETH_PHOTOS: "TEETH_PHOTOS";
    readonly PASSPORT: "PASSPORT";
    readonly FLIGHT_TICKET: "FLIGHT_TICKET";
};
export type DealDocument = (typeof DealDocument)[keyof typeof DealDocument];
export declare const DEAL_DOCUMENT_LABELS: Record<DealDocument, string>;
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
export declare const PIPELINE_STAGES: PipelineStageDef[];
export declare const STAGE_LABELS: Record<string, string>;
export declare function stageDef(stage: string): PipelineStageDef | undefined;
/** Which documents a deal at this stage should already have on file. */
export declare function documentsExpectedAt(stage: string): DealDocument[];
/** A deal reaching DONE has been treated, so the patient moves into after-care. */
export declare const AFTERCARE_FROM_STAGE: PipelineStage;
/**
 * How far along a deal is, used to choose which of several duplicates to keep.
 *
 * The stage list is already in pipeline order, so its index is the answer everywhere except Lost:
 * that sits at the end of the board because it is where cards go, not because it is the furthest a
 * deal can get. Ranking it below New Deal keeps a dead enquiry from swallowing a live one.
 */
export declare function stageProgress(stage: string): number;
//# sourceMappingURL=stages.d.ts.map