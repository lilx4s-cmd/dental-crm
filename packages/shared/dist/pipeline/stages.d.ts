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
    /** Tailwind border colour for the board column. Identity, not status — each stage is distinct. */
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
//# sourceMappingURL=stages.d.ts.map