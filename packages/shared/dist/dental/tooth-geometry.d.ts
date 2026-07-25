import { ToothCondition } from './tooth-conditions';
export type DrawOp = {
    kind: 'path';
    d: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
} | {
    kind: 'circle';
    cx: number;
    cy: number;
    r: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
} | {
    kind: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    rx?: number;
    opacity?: number;
} | {
    kind: 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke: string;
    strokeWidth: number;
    opacity?: number;
};
export type ToothType = 'incisor' | 'canine' | 'premolar' | 'molar';
export declare const UPPER_RIGHT: string[];
export declare const UPPER_LEFT: string[];
export declare const LOWER_RIGHT: string[];
export declare const LOWER_LEFT: string[];
export declare const UPPER_TEETH: string[];
export declare const LOWER_TEETH: string[];
export declare const ALL_TEETH: string[];
export declare function isUpperTooth(fdi: string): boolean;
export declare function toothType(fdi: string): ToothType;
export declare const PALETTE: {
    readonly enamel: "#ffffff";
    readonly enamelStroke: "#3f3f46";
    readonly dentin: "#f2e3c9";
    readonly gum: "#f2b8c6";
    readonly gumDeep: "#e295aa";
    readonly bone: "#f6ecdd";
    readonly boneSpeck: "#d9c4a3";
    readonly caries: "#e11d48";
    readonly amalgam: "#9ca3af";
    readonly composite: "#fafaf9";
    readonly metal: "#71717a";
    readonly plaque: "#facc15";
    readonly cyst: "#b91c1c";
    readonly planned: "#86c98b";
    readonly plannedStroke: "#2f6b39";
    readonly plannedDeep: "#166534";
    readonly marker: "#0f766e";
};
export type ChartMode = 'diagnosis' | 'plan';
interface ToothSpec {
    crown: string;
    roots: string[];
    neckHalfWidth: number;
    crownTop: number;
    rootTip: number;
    midHalfWidth: number;
    edgeHalfWidth: number;
}
export declare function toothSpec(fdi: string): ToothSpec;
export declare const SLOT_WIDTH = 62;
export declare const MIDLINE_GAP = 10;
export declare const ARCH_WIDTH: number;
export declare const GUM_DEPTH = 16;
export declare const BONE_TOP = 9;
export declare const BONE_DEPTH = 72;
export declare const MAX_CROWN_HEIGHT = 55;
export declare const MAX_ROOT_LENGTH = 74;
/**
 * Vertical anchors for a full two-arch chart, all measured from the top of the viewBox. The upper
 * arch is drawn mirrored about its gum line, so its bone lands above it and its crowns below.
 */
export declare const LAYOUT: {
    upperGumY: number;
    readonly upperCrownEdgeY: number;
    readonly upperLabelY: number;
    readonly lowerLabelY: number;
    readonly lowerGumY: number;
    readonly height: number;
};
/** X offset of a tooth's centre within an arch row, given its index 0..15 across both quadrants. */
export declare function slotCenterX(index: number): number;
/**
 * A tooth split at the gum margin. The arch renderer draws every tooth's `subgingival` layer, then
 * the gum, then every `supragingival` layer — so roots sit inside the gum and bone the way they
 * actually do, and the crown-to-root junction is hidden by the gum instead of showing as a seam.
 */
export interface ToothLayers {
    subgingival: DrawOp[];
    supragingival: DrawOp[];
}
/** Builds the draw ops for one tooth in its own local space (origin at the neck). */
export declare function buildTooth(fdi: string, condition: ToothCondition, mode?: ChartMode): ToothLayers;
/** Marks drawn beside a tooth rather than on it — currently just the extraction cross. */
export declare function buildToothMarker(condition: ToothCondition, mode: ChartMode): DrawOp[];
/**
 * The gum ridge: a scalloped band whose peaks sit between the teeth and whose troughs sit over each
 * tooth's neck, which is what gives a real arch its wavy margin. `recession` lifts the margin away
 * from selected teeth to show bone loss.
 */
export declare function buildGumPath(count: number, recessionByIndex?: Record<number, boolean>, edentulousByIndex?: Record<number, boolean>): string;
/**
 * Cancellous bone above the gum, drawn as a flat field plus a deterministic speckle. The speckle
 * uses a seeded pseudo-random sequence rather than Math.random so the same chart renders identically
 * on the server (PDF) and in the browser — otherwise a patient's PDF would not match their portal.
 */
export declare function buildBone(seed?: number): DrawOp[];
export {};
//# sourceMappingURL=tooth-geometry.d.ts.map