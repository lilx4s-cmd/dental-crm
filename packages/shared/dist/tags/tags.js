"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_TAGS_PER_RECORD = exports.TAG_NAME_MAX = exports.TAG_COLORS = exports.TAG_CATEGORY_ORDER = exports.TAG_CATEGORY_LABELS = exports.TagCategory = exports.TagColor = void 0;
exports.tagColorDef = tagColorDef;
exports.normaliseTagName = normaliseTagName;
exports.TagColor = {
    SLATE: 'SLATE',
    RED: 'RED',
    ORANGE: 'ORANGE',
    AMBER: 'AMBER',
    GREEN: 'GREEN',
    TEAL: 'TEAL',
    BLUE: 'BLUE',
    INDIGO: 'INDIGO',
    VIOLET: 'VIOLET',
    PINK: 'PINK',
};
exports.TagCategory = {
    /** What they want done: implants, veneers, a full-arch case. */
    TREATMENT: 'TREATMENT',
    /** Where they came from, beyond what `Lead.source` records: a market, an agency, a referrer. */
    ORIGIN: 'ORIGIN',
    /** How this deal should be handled: VIP, price-sensitive, needs a translator. */
    HANDLING: 'HANDLING',
    /** What it is waiting on, when that is not a pipeline stage: no budget, family deciding. */
    BLOCKER: 'BLOCKER',
    /** Anything that does not belong to an axis yet. */
    GENERAL: 'GENERAL',
};
exports.TAG_CATEGORY_LABELS = {
    TREATMENT: 'Treatment',
    ORIGIN: 'Origin',
    HANDLING: 'Handling',
    BLOCKER: 'Blocker',
    GENERAL: 'General',
};
/** Order tags are grouped in, most operationally useful first. */
exports.TAG_CATEGORY_ORDER = [
    'HANDLING',
    'BLOCKER',
    'TREATMENT',
    'ORIGIN',
    'GENERAL',
];
exports.TAG_COLORS = [
    { id: 'SLATE', label: 'Slate', swatch: '#64748b', className: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/40' },
    { id: 'RED', label: 'Red', swatch: '#ef4444', className: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40' },
    { id: 'ORANGE', label: 'Orange', swatch: '#f97316', className: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/40' },
    { id: 'AMBER', label: 'Amber', swatch: '#f59e0b', className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40' },
    { id: 'GREEN', label: 'Green', swatch: '#22c55e', className: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/40' },
    { id: 'TEAL', label: 'Teal', swatch: '#14b8a6', className: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/40' },
    { id: 'BLUE', label: 'Blue', swatch: '#3b82f6', className: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/40' },
    { id: 'INDIGO', label: 'Indigo', swatch: '#6366f1', className: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/40' },
    { id: 'VIOLET', label: 'Violet', swatch: '#8b5cf6', className: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/40' },
    { id: 'PINK', label: 'Pink', swatch: '#ec4899', className: 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/40' },
];
const BY_ID = new Map(exports.TAG_COLORS.map((c) => [c.id, c]));
/** Falls back to slate: an unknown colour should render a plain pill, never an unstyled one. */
function tagColorDef(color) {
    return BY_ID.get(color) ?? exports.TAG_COLORS[0];
}
/**
 * A tag name as it will be stored.
 *
 * Collapsed whitespace and a length bound. Case is *preserved* but not significant — uniqueness is
 * enforced case-insensitively in the service, so "VIP" and "vip" cannot both exist while the tag
 * still displays the way whoever created it wrote it.
 */
exports.TAG_NAME_MAX = 40;
function normaliseTagName(raw) {
    return raw.trim().replace(/\s+/g, ' ').slice(0, exports.TAG_NAME_MAX);
}
/**
 * How many tags one deal or patient can carry.
 *
 * A cap because tags are a filter, and a record with twenty of them filters into every list, which
 * is the same as having none. Twelve is well above what anyone uses and well below the point where
 * the card stops being readable.
 */
exports.MAX_TAGS_PER_RECORD = 12;
//# sourceMappingURL=tags.js.map