export interface PresetItem {
    description: string;
    /** Matched case-insensitively against the clinic's TreatmentCategory names; skipped if absent. */
    categoryName?: string;
    material?: string;
    teeth: string[];
}
export interface PresetPhase {
    phaseNumber: number;
    name?: string;
    /** Months of healing before the next phase can start. */
    healingPeriodMonths?: number;
    items: PresetItem[];
}
export interface TreatmentPreset {
    id: string;
    name: string;
    summary: string;
    phases: PresetPhase[];
}
export declare const TREATMENT_PRESETS: TreatmentPreset[];
export declare function findPreset(id: string): TreatmentPreset | undefined;
//# sourceMappingURL=presets.d.ts.map