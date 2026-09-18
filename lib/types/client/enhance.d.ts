/**
 * The display layer: every recognized path chip shows a file-type glyph and
 * the file's name instead of its full path.
 *
 * The shell owns these chips and offers no slot to change how one draws, so
 * this layer re-dresses each chip in place. React rewrites a chip whenever its
 * props change — measured, not assumed: a re-render with unchanged props
 * leaves inserted nodes alone, while a changed text node is written outright,
 * which rebuilds that button's children — so the layer works off the mutation
 * stream and runs again after each commit.
 *
 * Three facts keep it safe:
 *
 * - Nothing here removes or reorders a node the shell owns. The glyph is
 *   inserted, and the path text is shortened in place; the button, its click
 *   handler, and the row's interaction stay exactly the shell's.
 * - The full path is stamped on the button, so the menu still acts on the file
 *   (see `toolTargetOf` in `surfaces.ts`, which reads the stamp back) and a
 *   later pass can shorten an already-shortened chip without losing the path.
 * - Every pass converges: a chip already carrying its glyph and its short name
 *   is left untouched, so this layer's own writes produce no further work.
 */
import { ENHANCED_ATTR } from './chips.ts';
import { FULL_PATH_ATTR } from './surfaces.ts';
/** Handle returned by {@link attachChipEnhancement}. */
export interface ChipEnhancement {
    /** Re-dress every chip currently on the page. */
    scan(): void;
    /** Stop watching; chips already re-dressed keep their rendering. */
    dispose(): void;
}
/**
 * Watch the document and re-dress every path chip it holds.
 *
 * A commit touches many chips at once and a streaming turn commits
 * continuously, so the pending regions collapse onto one pass per frame.
 * @param glyph - builds one glyph element for a path, or null when unavailable.
 * @returns the scan/dispose handle.
 */
export declare function attachChipEnhancement(glyph: (path: string) => Element | null): ChipEnhancement;
/** Re-exported for the callers that install the layer. */
export { ENHANCED_ATTR, FULL_PATH_ATTR };
//# sourceMappingURL=enhance.d.ts.map