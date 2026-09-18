/**
 * Scope one glyph's embedded ids to a single instance.
 *
 * The suffix is APPENDED to each original id rather than replacing it. One
 * piece of artwork declares several — `dsh-code-icon-r0a`, `dsh-code-icon-r0b`,
 * one per gradient — and its shapes reference them by `url(#…)`, so collapsing
 * several ids onto one shared value would leave part of the artwork pointing at
 * a gradient that no longer exists.
 * @param markup - the cached markup for one file type.
 * @param instance - this instance's number, unique across the page.
 * @returns the markup with every embedded id scoped to the instance.
 */
export declare function scopeIconIds(markup: string, instance: number): string;
/** Which surface a recognized chip belongs to. */
export type ChipShape = 'tool' | 'mention' | 'reference' | 'produced';
/** One recognized chip with the facts the enhancer needs. */
export interface ChipTarget {
    /** The control to re-dress. */
    readonly element: HTMLElement;
    /** Which surface this chip is, deciding how its path is read. */
    readonly shape: ChipShape;
    /**
     * The full path the chip stands for. Where the shell publishes one it comes
     * from `title`; on a tool button, from the stamp a previous pass left;
     * otherwise from the button's own text.
     */
    readonly path: string;
}
/** Attribute marking a chip this plugin already re-dressed. */
export declare const ENHANCED_ATTR = "data-flm-enhanced";
/**
 * Attribute marking the glyph this plugin stamped.
 *
 * Declared here rather than beside the glyph builder (`icons.ts`) so the
 * recognition and re-dress layers stay free of the shared primitives module:
 * that module is a browser ESM build importing CSS, which the plugin's own
 * suite cannot load, and the layers under test must not drag it in.
 */
export declare const ICON_ATTR = "data-flm-icon";
/**
 * Attribute recording the display name this plugin wrote on a chip.
 *
 * It is what tells the layer's own shortened text from a path the shell wrote
 * afterwards: React rewrites a chip's text whenever its props change, and
 * without that distinction a re-rendered chip would keep showing the name
 * recorded before the change.
 */
export declare const SHOWN_NAME_ATTR = "data-flm-shown";
/**
 * Attribute recording the path this plugin built the chip's glyph for.
 *
 * A chip whose file type changes would otherwise keep the glyph it had: a
 * produced chip's name sits in a span React updates on its own, so the
 * button's children — and the glyph among them — are never touched by that
 * update. Comparing this recorded path against the current one is what makes
 * the glyph follow the type instead of continuing to describe the file the
 * chip used to name.
 */
export declare const ICON_PATH_ATTR = "data-flm-icon-for";
/** Every chip shape, as one selector for a scan pass. */
export declare const CHIP_SELECTOR: string;
/**
 * The name a chip displays for a path: its last segment.
 *
 * A path with no separator is already a name. Trailing separators (a directory
 * reference) are dropped so a path that had content never renders empty.
 * @param path - the full path the chip stands for.
 * @returns the final path segment, or the input when it names no segment.
 */
export declare function displayNameOf(path: string): string;
/**
 * Recognize the chip one element is, if any.
 * @param element - element a scan pass found under {@link CHIP_SELECTOR}.
 * @returns the chip target, or undefined when this is not one of our shapes.
 */
export declare function recognizeChip(element: Element | null): ChipTarget | undefined;
//# sourceMappingURL=chips.d.ts.map