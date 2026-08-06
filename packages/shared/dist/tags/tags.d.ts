/**
 * The tag vocabulary: a fixed palette and a small set of categories.
 *
 * Both are constrained rather than free-text, and each for its own reason.
 *
 * **Colour.** The `Tag` table has carried a free-text hex column since it was written, and the
 * patient list paints it straight onto a border. Arbitrary hex has two problems on this app: it
 * ignores the theme, so a colour picked against a white background is close to invisible on the
 * dark one, and it lets ten people invent ten shades of nearly-the-same blue until the colour
 * stops carrying meaning at all. Ten named colours is enough to tell tags apart and few enough
 * that each one keeps a meaning.
 *
 * **Category.** A category is not decoration — it is what lets a card show the two tags that
 * matter instead of the eleven that exist. A deal tagged `Implants`, `Saudi Arabia`, `VIP` and
 * `Awaiting photos` has one tag from four different axes, and the board can show one per axis
 * rather than truncating an arbitrary list.
 */
export declare const TagColor: {
    readonly SLATE: "SLATE";
    readonly RED: "RED";
    readonly ORANGE: "ORANGE";
    readonly AMBER: "AMBER";
    readonly GREEN: "GREEN";
    readonly TEAL: "TEAL";
    readonly BLUE: "BLUE";
    readonly INDIGO: "INDIGO";
    readonly VIOLET: "VIOLET";
    readonly PINK: "PINK";
};
export type TagColor = (typeof TagColor)[keyof typeof TagColor];
export declare const TagCategory: {
    /** What they want done: implants, veneers, a full-arch case. */
    readonly TREATMENT: "TREATMENT";
    /** Where they came from, beyond what `Lead.source` records: a market, an agency, a referrer. */
    readonly ORIGIN: "ORIGIN";
    /** How this deal should be handled: VIP, price-sensitive, needs a translator. */
    readonly HANDLING: "HANDLING";
    /** What it is waiting on, when that is not a pipeline stage: no budget, family deciding. */
    readonly BLOCKER: "BLOCKER";
    /** Anything that does not belong to an axis yet. */
    readonly GENERAL: "GENERAL";
};
export type TagCategory = (typeof TagCategory)[keyof typeof TagCategory];
export declare const TAG_CATEGORY_LABELS: Record<TagCategory, string>;
/** Order tags are grouped in, most operationally useful first. */
export declare const TAG_CATEGORY_ORDER: TagCategory[];
export interface TagColorDef {
    id: TagColor;
    label: string;
    /**
     * Tailwind classes, not a hex value.
     *
     * A hex border can be written inline but a *readable* pill needs a background, a foreground and
     * a border that all move together between light and dark — which is three related values, not
     * one. Written as literal class strings because Tailwind scans source text: a class assembled at
     * runtime (`bg-${colour}-100`) is never generated and the pill renders unstyled.
     */
    className: string;
    /** For the one place a raw colour is still needed: the swatch in the colour picker. */
    swatch: string;
}
export declare const TAG_COLORS: TagColorDef[];
/** Falls back to slate: an unknown colour should render a plain pill, never an unstyled one. */
export declare function tagColorDef(color: string | null | undefined): TagColorDef;
/**
 * A tag name as it will be stored.
 *
 * Collapsed whitespace and a length bound. Case is *preserved* but not significant — uniqueness is
 * enforced case-insensitively in the service, so "VIP" and "vip" cannot both exist while the tag
 * still displays the way whoever created it wrote it.
 */
export declare const TAG_NAME_MAX = 40;
export declare function normaliseTagName(raw: string): string;
/**
 * How many tags one deal or patient can carry.
 *
 * A cap because tags are a filter, and a record with twenty of them filters into every list, which
 * is the same as having none. Twelve is well above what anyone uses and well below the point where
 * the card stops being readable.
 */
export declare const MAX_TAGS_PER_RECORD = 12;
//# sourceMappingURL=tags.d.ts.map