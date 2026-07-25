"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_CONDITIONS = exports.DIAGNOSIS_CONDITIONS = exports.TOOTH_CONDITION_LABELS = exports.ToothCondition = void 0;
exports.conditionFromText = conditionFromText;
// Conditions a single tooth can be marked with, covering both what a tooth looks like *today*
// (the diagnosis chart) and what is *planned* for it (the treatment chart). One enum serves both
// because several values legitimately appear on either side — an implant is a finding on an
// already-treated patient and a proposal on a new one — and splitting them would force callers to
// translate between two near-identical vocabularies.
exports.ToothCondition = {
    HEALTHY: 'HEALTHY',
    // Findings — things observed on the tooth as it stands.
    CARIES: 'CARIES',
    PLAQUE: 'PLAQUE',
    AMALGAM_FILLING: 'AMALGAM_FILLING',
    COMPOSITE_FILLING: 'COMPOSITE_FILLING',
    MISSING: 'MISSING',
    FRACTURED: 'FRACTURED',
    WORN: 'WORN',
    ONLY_ROOT: 'ONLY_ROOT',
    ROOT_CANAL_TREATED: 'ROOT_CANAL_TREATED',
    MOBILITY: 'MOBILITY',
    RECEDING_BONE: 'RECEDING_BONE',
    CYST: 'CYST',
    // Proposals — things to be done to the tooth.
    EXTRACTION: 'EXTRACTION',
    IMPLANT: 'IMPLANT',
    CROWN: 'CROWN',
    VENEER: 'VENEER',
    BRIDGE: 'BRIDGE',
    FILLING: 'FILLING',
    ROOT_CANAL: 'ROOT_CANAL',
    CLEANING: 'CLEANING',
    BONE_GRAFT: 'BONE_GRAFT',
    SINUS_LIFT: 'SINUS_LIFT',
};
exports.TOOTH_CONDITION_LABELS = {
    HEALTHY: 'Healthy',
    CARIES: 'Cavities (Dental Caries)',
    PLAQUE: 'Plaque',
    AMALGAM_FILLING: 'Amalgam Filling',
    COMPOSITE_FILLING: 'Composite Filling',
    MISSING: 'Missing',
    FRACTURED: 'Fractured',
    WORN: 'Worn',
    ONLY_ROOT: 'Only Root',
    ROOT_CANAL_TREATED: 'Root Canal Treated',
    MOBILITY: 'Mobility',
    RECEDING_BONE: 'Receding Bone Level',
    CYST: 'Cyst',
    EXTRACTION: 'Extraction',
    IMPLANT: 'Implant',
    CROWN: 'Crown',
    VENEER: 'Veneer',
    BRIDGE: 'Bridge',
    FILLING: 'Filling',
    ROOT_CANAL: 'Root Canal Treatment',
    CLEANING: 'Cleaning',
    BONE_GRAFT: 'Bone Graft',
    SINUS_LIFT: 'Sinus Lift',
};
// Which conditions make sense to record as a finding vs. as planned work. The chart renders any
// condition in either mode, but the pickers use these to avoid offering "Extraction" as a diagnosis.
exports.DIAGNOSIS_CONDITIONS = [
    'CARIES',
    'PLAQUE',
    'AMALGAM_FILLING',
    'COMPOSITE_FILLING',
    'MISSING',
    'FRACTURED',
    'WORN',
    'ONLY_ROOT',
    'ROOT_CANAL_TREATED',
    'MOBILITY',
    'RECEDING_BONE',
    'CYST',
    'IMPLANT',
];
exports.PLAN_CONDITIONS = [
    'EXTRACTION',
    'IMPLANT',
    'CROWN',
    'VENEER',
    'BRIDGE',
    'FILLING',
    'ROOT_CANAL',
    'CLEANING',
    'BONE_GRAFT',
    'SINUS_LIFT',
];
// Free-text procedure descriptions and treatment-category names are matched to a condition by
// substring so the chart lights up without staff having to pick a condition separately. Order
// matters: the first match wins, so more specific terms ("root canal") precede looser ones
// ("canal" would never be reached, but "filling" must not shadow "composite filling").
const KEYWORD_MAP = [
    { match: 'sinus lift', condition: 'SINUS_LIFT' },
    { match: 'bone graft', condition: 'BONE_GRAFT' },
    { match: 'root canal', condition: 'ROOT_CANAL' },
    { match: 'root treatment', condition: 'ROOT_CANAL' },
    { match: 'endodont', condition: 'ROOT_CANAL' },
    { match: 'amalgam', condition: 'AMALGAM_FILLING' },
    { match: 'composite', condition: 'COMPOSITE_FILLING' },
    { match: 'extract', condition: 'EXTRACTION' },
    { match: 'implant', condition: 'IMPLANT' },
    { match: 'zirconia', condition: 'CROWN' },
    { match: 'crown', condition: 'CROWN' },
    { match: 'veneer', condition: 'VENEER' },
    { match: 'bridge', condition: 'BRIDGE' },
    { match: 'filling', condition: 'FILLING' },
    { match: 'caries', condition: 'CARIES' },
    { match: 'cavit', condition: 'CARIES' },
    { match: 'scaling', condition: 'CLEANING' },
    { match: 'clean', condition: 'CLEANING' },
    { match: 'whiten', condition: 'CLEANING' },
    { match: 'plaque', condition: 'PLAQUE' },
    { match: 'fractur', condition: 'FRACTURED' },
    { match: 'worn', condition: 'WORN' },
    { match: 'cyst', condition: 'CYST' },
    { match: 'missing', condition: 'MISSING' },
];
function conditionFromText(...texts) {
    const haystack = texts.filter(Boolean).join(' ').toLowerCase();
    if (!haystack)
        return undefined;
    return KEYWORD_MAP.find((k) => haystack.includes(k.match))?.condition;
}
//# sourceMappingURL=tooth-conditions.js.map