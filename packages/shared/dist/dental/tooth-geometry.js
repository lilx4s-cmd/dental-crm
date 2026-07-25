"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAYOUT = exports.MAX_ROOT_LENGTH = exports.MAX_CROWN_HEIGHT = exports.BONE_DEPTH = exports.BONE_TOP = exports.GUM_DEPTH = exports.ARCH_WIDTH = exports.MIDLINE_GAP = exports.SLOT_WIDTH = exports.PALETTE = exports.ALL_TEETH = exports.LOWER_TEETH = exports.UPPER_TEETH = exports.LOWER_LEFT = exports.LOWER_RIGHT = exports.UPPER_LEFT = exports.UPPER_RIGHT = void 0;
exports.isUpperTooth = isUpperTooth;
exports.parseToothNumbers = parseToothNumbers;
exports.toothType = toothType;
exports.toothSpec = toothSpec;
exports.slotCenterX = slotCenterX;
exports.buildTooth = buildTooth;
exports.buildToothMarker = buildToothMarker;
exports.buildGumPath = buildGumPath;
exports.buildBone = buildBone;
// FDI two-digit notation (ISO 3950). Quadrants run 1=upper-right, 2=upper-left, 3=lower-left,
// 4=lower-right; the second digit counts outward from the midline, so it alone determines the
// tooth's shape regardless of which quadrant it sits in.
exports.UPPER_RIGHT = ['18', '17', '16', '15', '14', '13', '12', '11'];
exports.UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27', '28'];
exports.LOWER_RIGHT = ['48', '47', '46', '45', '44', '43', '42', '41'];
exports.LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37', '38'];
exports.UPPER_TEETH = [...exports.UPPER_RIGHT, ...exports.UPPER_LEFT];
exports.LOWER_TEETH = [...exports.LOWER_RIGHT, ...exports.LOWER_LEFT];
exports.ALL_TEETH = [...exports.UPPER_TEETH, ...exports.LOWER_TEETH];
function isUpperTooth(fdi) {
    return fdi[0] === '1' || fdi[0] === '2';
}
/**
 * Reads the tooth numbers out of a line item's free-text tooth field. One procedure routinely
 * covers many teeth — a full-arch bridge is one price across twelve units — so the field accepts a
 * separated list and every chart resolves it through here. A plain "16" yields a single entry, which
 * keeps every plan written before multi-tooth items existed working unchanged.
 */
function parseToothNumbers(value) {
    if (!value)
        return [];
    return value
        .split(/[\s,;|/]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}
function toothType(fdi) {
    switch (fdi[1]) {
        case '1':
        case '2':
            return 'incisor';
        case '3':
            return 'canine';
        case '4':
        case '5':
            return 'premolar';
        default:
            return 'molar';
    }
}
exports.PALETTE = {
    enamel: '#ffffff',
    enamelStroke: '#3f3f46',
    dentin: '#f2e3c9',
    gum: '#f2b8c6',
    gumDeep: '#e295aa',
    bone: '#f6ecdd',
    boneSpeck: '#d9c4a3',
    caries: '#e11d48',
    amalgam: '#9ca3af',
    composite: '#fafaf9',
    metal: '#71717a',
    plaque: '#facc15',
    cyst: '#b91c1c',
    // The proposed-treatment chart is drawn in a single green so a patient can tell at a glance which
    // teeth the plan touches, rather than having to decode a dozen material colours.
    planned: '#86c98b',
    plannedStroke: '#2f6b39',
    plannedDeep: '#166534',
    marker: '#0f766e',
};
const SPECS = {
    incisor: {
        // Chisel-edged: distinctly wider at the incisal edge than at the neck, with rounded shoulders.
        crown: 'M -9.5 3 C -11 -10 -12.5 -22 -13.5 -33 C -13.8 -40 -11.5 -43 -8.5 -43 L 8.5 -43 C 11.5 -43 13.8 -40 13.5 -33 C 12.5 -22 11 -10 9.5 3 Z',
        roots: ['M -9.5 -2 L 9.5 -2 C 8.5 15 7 31 5.5 42 C 4 54 2 62 0 62 C -2 62 -4 54 -5.5 42 C -7 31 -8.5 15 -9.5 -2 Z'],
        neckHalfWidth: 9.5,
        crownTop: -43,
        rootTip: 62,
        midHalfWidth: 12,
        edgeHalfWidth: 13.5,
    },
    canine: {
        // A single pointed cusp on the longest root in the mouth.
        crown: 'M -10.5 3 C -12 -10 -13.5 -22 -14 -30 C -14.5 -38 -11 -43 -6 -47 L 0 -53 L 6 -47 C 11 -43 14.5 -38 14 -30 C 13.5 -22 12 -10 10.5 3 Z',
        roots: ['M -10.5 -2 L 10.5 -2 C 9.5 18 8 38 6 51 C 4.5 65 2 74 0 74 C -2 74 -4.5 65 -6 51 C -8 38 -9.5 18 -10.5 -2 Z'],
        neckHalfWidth: 10.5,
        crownTop: -53,
        rootTip: 74,
        midHalfWidth: 12.5,
        edgeHalfWidth: 14,
    },
    premolar: {
        // Two cusps with a central fissure dipping between them.
        crown: 'M -12 3 C -13.5 -8 -15.5 -20 -16 -28 C -16.5 -36 -12 -40 -6.5 -38.5 L 0 -32 L 6.5 -38.5 C 12 -40 16.5 -36 16 -28 C 15.5 -20 13.5 -8 12 3 Z',
        roots: ['M -12 -2 L 12 -2 C 10.5 16 9 32 7 43 C 5 55 2 62 0 62 C -2 62 -5 55 -7 43 C -9 32 -10.5 16 -12 -2 Z'],
        neckHalfWidth: 12,
        crownTop: -40,
        rootTip: 62,
        midHalfWidth: 14.5,
        edgeHalfWidth: 16.5,
    },
    molar: {
        // A broad, bulbous occlusal table with three cusps, carried on two splayed roots.
        crown: 'M -18 3 C -21 -8 -23.5 -20 -24 -28 C -24.5 -36 -19.5 -40 -13.5 -38 L -7.5 -32 L 0 -37 L 7.5 -32 L 13.5 -38 C 19.5 -40 24.5 -36 24 -28 C 23.5 -20 21 -8 18 3 Z',
        roots: [
            'M -18 -2 L -3 -2 C -4.5 14 -6 27 -8 36 C -10 48 -12.5 55 -15.5 54 C -18.5 53 -19.5 44 -19 32 C -18.5 21 -18 9 -18 -2 Z',
            'M 18 -2 L 3 -2 C 4.5 14 6 27 8 36 C 10 48 12.5 55 15.5 54 C 18.5 53 19.5 44 19 32 C 18.5 21 18 9 18 -2 Z',
        ],
        neckHalfWidth: 18,
        crownTop: -40,
        rootTip: 55,
        midHalfWidth: 21,
        edgeHalfWidth: 24.5,
    },
};
function toothSpec(fdi) {
    return SPECS[toothType(fdi)];
}
// --- Arch layout --------------------------------------------------------------------------------
exports.SLOT_WIDTH = 62; // horizontal pitch between adjacent teeth
exports.MIDLINE_GAP = 10; // extra space where the two quadrants meet
exports.ARCH_WIDTH = exports.SLOT_WIDTH * 16 + exports.MIDLINE_GAP;
// Within a tooth's local space (neck at y=0, crown negative, root positive) these bound the
// surrounding tissue. Bone therefore always sits on the root side and gum always meets the crown,
// which stays true after the upper arch is mirrored.
exports.GUM_DEPTH = 16; // how far past the neck the gum is filled
exports.BONE_TOP = 9; // where cancellous bone starts, just under the gum
exports.BONE_DEPTH = 72;
exports.MAX_CROWN_HEIGHT = 55;
exports.MAX_ROOT_LENGTH = 74;
/**
 * Vertical anchors for a full two-arch chart, all measured from the top of the viewBox. The upper
 * arch is drawn mirrored about its gum line, so its bone lands above it and its crowns below.
 */
exports.LAYOUT = {
    upperGumY: exports.BONE_TOP + exports.BONE_DEPTH,
    get upperCrownEdgeY() {
        return this.upperGumY + exports.MAX_CROWN_HEIGHT;
    },
    get upperLabelY() {
        return this.upperCrownEdgeY + 15;
    },
    get lowerLabelY() {
        return this.upperLabelY + 21;
    },
    get lowerGumY() {
        return this.lowerLabelY + 8 + exports.MAX_CROWN_HEIGHT;
    },
    get height() {
        return this.lowerGumY + exports.BONE_TOP + exports.BONE_DEPTH;
    },
};
/** X offset of a tooth's centre within an arch row, given its index 0..15 across both quadrants. */
function slotCenterX(index) {
    return exports.SLOT_WIDTH * (index + 0.5) + (index >= 8 ? exports.MIDLINE_GAP : 0);
}
// --- Per-tooth rendering ------------------------------------------------------------------------
function planTint(mode, natural) {
    return mode === 'plan' ? exports.PALETTE.planned : natural;
}
function outlineStroke(mode) {
    return mode === 'plan' ? exports.PALETTE.plannedStroke : exports.PALETTE.enamelStroke;
}
/** A titanium fixture drawn in place of the root, with thread hatching. */
function implantOps(mode) {
    const body = mode === 'plan' ? exports.PALETTE.planned : '#d4d4d8';
    const stroke = outlineStroke(mode);
    const ops = [
        { kind: 'path', d: 'M -6 -2 L 6 -2 L 4.5 46 C 4.5 54 -4.5 54 -4.5 46 Z', fill: body, stroke, strokeWidth: 1.2 },
    ];
    for (let y = 4; y < 44; y += 6) {
        ops.push({ kind: 'line', x1: -5.6, y1: y, x2: 5.6, y2: y + 3, stroke, strokeWidth: 1 });
    }
    return ops;
}
/** Builds the draw ops for one tooth in its own local space (origin at the neck). */
function buildTooth(fdi, condition, mode = 'diagnosis') {
    const spec = toothSpec(fdi);
    const stroke = outlineStroke(mode);
    const below = [];
    const above = [];
    // A missing tooth leaves an empty socket — nothing to draw but the gap itself.
    if (condition === 'MISSING')
        return { subgingival: below, supragingival: above };
    const isCapped = condition === 'CROWN' || condition === 'VENEER' || condition === 'BRIDGE';
    if (condition === 'IMPLANT') {
        below.push(...implantOps(mode));
        // An implant is restored with a crown, so it always carries one.
        above.push({ kind: 'path', d: spec.crown, fill: planTint(mode, '#e4e4e7'), stroke, strokeWidth: 1.3 });
        return { subgingival: below, supragingival: above };
    }
    for (const d of spec.roots) {
        below.push({ kind: 'path', d, fill: planTint(mode, exports.PALETTE.dentin), stroke, strokeWidth: 1.2 });
    }
    // A treated canal is drawn as a filled line running down the middle of each root.
    if (condition === 'ROOT_CANAL' || condition === 'ROOT_CANAL_TREATED') {
        const canal = mode === 'plan' ? exports.PALETTE.plannedDeep : exports.PALETTE.metal;
        const tip = spec.rootTip;
        if (spec.roots.length > 1) {
            below.push({ kind: 'path', d: `M -11 0 L -6 0 L -10 ${tip * 0.8} L -12.5 ${tip * 0.72} Z`, fill: canal });
            below.push({ kind: 'path', d: `M 11 0 L 6 0 L 10 ${tip * 0.8} L 12.5 ${tip * 0.72} Z`, fill: canal });
        }
        else {
            below.push({ kind: 'path', d: `M -3 0 L 3 0 L 1.2 ${tip * 0.86} L -1.2 ${tip * 0.86} Z`, fill: canal });
        }
    }
    // A cyst is a lesion in the bone at the root apex, so it belongs under the gum too.
    if (condition === 'CYST') {
        below.push({
            kind: 'circle',
            cx: 0,
            cy: spec.rootTip - 4,
            r: 9,
            fill: planTint(mode, exports.PALETTE.cyst),
            stroke,
            strokeWidth: 0.8,
        });
    }
    // "Only root" means the crown is gone — there is nothing above the gum.
    if (condition === 'ONLY_ROOT')
        return { subgingival: below, supragingival: above };
    const crownFill = isCapped ? planTint(mode, condition === 'VENEER' ? '#e8f4fb' : '#e8d9a8') : planTint(mode, exports.PALETTE.enamel);
    above.push({ kind: 'path', d: spec.crown, fill: crownFill, stroke, strokeWidth: 1.3 });
    const ops = above;
    const w = spec.neckHalfWidth;
    const top = spec.crownTop;
    // The band across the belly of the crown where markings are guaranteed to stay inside the
    // outline, whatever the tooth type.
    const mw = spec.midHalfWidth;
    const occY = top * 0.66;
    switch (condition) {
        case 'CARIES':
            // A dark lesion eating into the biting surface.
            ops.push({
                kind: 'path',
                d: `M ${-mw * 0.6} ${occY} C ${-mw * 0.7} ${occY + 15} ${mw * 0.7} ${occY + 15} ${mw * 0.6} ${occY} C ${mw * 0.45} ${occY - 9} ${-mw * 0.45} ${occY - 9} ${-mw * 0.6} ${occY} Z`,
                fill: planTint(mode, exports.PALETTE.caries),
            });
            break;
        case 'AMALGAM_FILLING':
        case 'COMPOSITE_FILLING':
        case 'FILLING': {
            const fill = condition === 'COMPOSITE_FILLING' ? exports.PALETTE.composite : exports.PALETTE.amalgam;
            ops.push({
                kind: 'rect',
                x: -mw * 0.55,
                y: occY - 4,
                width: mw * 1.1,
                height: 12,
                rx: 3,
                fill: planTint(mode, fill),
                stroke,
                strokeWidth: 0.8,
            });
            break;
        }
        case 'FRACTURED':
            // A wedge chipped out of one corner, drawn in the background colour so it reads as absent
            // enamel. Kept within the mid-crown band so it never pokes outside a tapered cusp.
            ops.push({
                kind: 'path',
                d: `M ${mw * 0.15} ${occY - 6} L ${mw * 0.85} ${occY - 2} L ${mw * 0.7} ${occY + 16} Z`,
                fill: '#ffffff',
                stroke,
                strokeWidth: 1,
            });
            break;
        case 'WORN':
            // Enamel ground away at the tip: mask off the cusp in the background colour and cap what is
            // left with a flat edge, so the tooth reads as shortened rather than merely marked.
            ops.push({
                kind: 'rect',
                x: -spec.edgeHalfWidth,
                y: top - 2,
                width: spec.edgeHalfWidth * 2,
                height: Math.abs(top - occY) + 2,
                fill: '#ffffff',
            });
            ops.push({ kind: 'line', x1: -mw * 0.95, y1: occY, x2: mw * 0.95, y2: occY, stroke, strokeWidth: 1.3 });
            break;
        case 'PLAQUE':
            // A stained band sitting right on the gum line.
            ops.push({ kind: 'rect', x: -w, y: -10, width: w * 2, height: 10, fill: planTint(mode, exports.PALETTE.plaque), opacity: 0.9 });
            break;
        case 'CLEANING':
            ops.push({ kind: 'rect', x: -w, y: -10, width: w * 2, height: 10, fill: planTint(mode, '#7dd3fc'), opacity: 0.8 });
            break;
        case 'VENEER':
            // A facing bonded to the front surface only, so it stops short of the neck.
            ops.push({
                kind: 'rect',
                x: -mw * 0.8,
                y: top * 0.9,
                width: mw * 1.6,
                height: Math.abs(top) * 0.72,
                rx: 3,
                fill: planTint(mode, '#cfeaf7'),
                stroke,
                strokeWidth: 0.9,
                opacity: 0.85,
            });
            break;
        case 'MOBILITY':
            // Arrows either side showing the tooth rocking in its socket.
            ops.push({ kind: 'line', x1: -w - 9, y1: -14, x2: -w - 3, y2: -14, stroke: exports.PALETTE.marker, strokeWidth: 2 });
            ops.push({ kind: 'line', x1: w + 3, y1: -14, x2: w + 9, y2: -14, stroke: exports.PALETTE.marker, strokeWidth: 2 });
            break;
        default:
            break;
    }
    return { subgingival: below, supragingival: above };
}
/** Marks drawn beside a tooth rather than on it — currently just the extraction cross. */
function buildToothMarker(condition, mode) {
    if (condition !== 'EXTRACTION')
        return [];
    const c = mode === 'plan' ? exports.PALETTE.plannedStroke : exports.PALETTE.marker;
    return [
        { kind: 'line', x1: -11, y1: -11, x2: 11, y2: 11, stroke: c, strokeWidth: 3.2 },
        { kind: 'line', x1: 11, y1: -11, x2: -11, y2: 11, stroke: c, strokeWidth: 3.2 },
    ];
}
// --- Gum and bone -------------------------------------------------------------------------------
/**
 * The gum ridge: a scalloped band whose peaks sit between the teeth and whose troughs sit over each
 * tooth's neck, which is what gives a real arch its wavy margin. `recession` lifts the margin away
 * from selected teeth to show bone loss.
 */
function buildGumPath(count, recessionByIndex = {}, edentulousByIndex = {}) {
    const PEAK = -26; // the interdental papilla crest, between two teeth
    const parts = [`M 0 ${PEAK}`];
    for (let i = 0; i < count; i++) {
        const cx = slotCenterX(i);
        const left = cx - exports.SLOT_WIDTH / 2;
        // A site with no tooth in it heals to a smooth ridge, so it gets no scallop at all — otherwise
        // the chart shows a papilla hugging a tooth that is not there.
        const dip = edentulousByIndex[i] ? PEAK : recessionByIndex[i] ? 14 : -2;
        parts.push(`C ${left + 10} ${PEAK} ${cx - 17} ${dip} ${cx} ${dip}`);
        parts.push(`C ${cx + 17} ${dip} ${cx + exports.SLOT_WIDTH / 2 - 10} ${PEAK} ${cx + exports.SLOT_WIDTH / 2} ${PEAK}`);
    }
    parts.push(`L ${exports.ARCH_WIDTH} ${exports.GUM_DEPTH} L 0 ${exports.GUM_DEPTH} Z`);
    return parts.join(' ');
}
/**
 * Cancellous bone above the gum, drawn as a flat field plus a deterministic speckle. The speckle
 * uses a seeded pseudo-random sequence rather than Math.random so the same chart renders identically
 * on the server (PDF) and in the browser — otherwise a patient's PDF would not match their portal.
 */
function buildBone(seed = 7) {
    const ops = [
        { kind: 'rect', x: 0, y: exports.BONE_TOP, width: exports.ARCH_WIDTH, height: exports.BONE_DEPTH, fill: exports.PALETTE.bone },
    ];
    let s = seed;
    const next = () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
    };
    const count = Math.floor((exports.ARCH_WIDTH * exports.BONE_DEPTH) / 620);
    for (let i = 0; i < count; i++) {
        const x = next() * exports.ARCH_WIDTH;
        const y = exports.BONE_TOP + next() * exports.BONE_DEPTH;
        const r = 0.8 + next() * 1.6;
        ops.push({ kind: 'circle', cx: x, cy: y, r, fill: exports.PALETTE.boneSpeck });
    }
    return ops;
}
//# sourceMappingURL=tooth-geometry.js.map