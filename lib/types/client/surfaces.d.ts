/**
 * The DOM anchors this plugin claims.
 *
 * The slot map has no file/link menu hole, so the browser half watches
 * `contextmenu` in the capture phase for the menu and `click` in the same
 * phase for the attachment preview, and recognizes a target from published
 * anchors:
 *
 * - external link: `<a href="http…">` (the shell marks external links with
 *   `target="_blank"`; same-page anchors carry no such href);
 * - delivered file card: `[data-presented-files-row]` with the absolute path
 *   on the chip's `title`;
 * - produced file chip: `[data-produced-files-row]`, same `title` convention;
 * - inline path mention: a `button[title]` carrying a path-shaped title and an
 *   accessible label, which is what the markdown renderer builds for a
 *   resolved mention;
 * - rendered `@` reference: a `button[data-ref-chip="file"]` whose `title` is
 *   the whole reference token (`@path`, or `@"path with spaces"`), which is
 *   what a sent message builds for a reference the user wrote. A token that is
 *   a paste name (`paster-…`, the name `dsh-auto-paste` writes) names an
 *   attachment rather than a path, so the Host resolves it against the
 *   attachment store and a click previews it like a card;
 * - tool call argument: the path button inside a `[data-tool]` card, which
 *   prints the path as its own text and carries no `title` (read, write, and
 *   image reads all render it that way);
 * - attached file: the card the shell draws for one attachment, in the
 *   transcript (`[data-message-attachments]`) and on the composer rail (the
 *   `role="group"` rail whose items hold the card), both carrying the
 *   attachment's display name on `title`. dsh's attachment store is
 *   content-addressed, so the name is not a path: the Host resolves it, and
 *   the browser keeps the name only.
 *
 * Losing an anchor costs the affected surface only: `detectTarget` returns
 * undefined and the shell's own menu opens as usual.
 */
/** Which surface a file target came from. */
export type FileSource = 'presented' | 'produced' | 'mention' | 'tool' | 'attachment';
/** What the menu acts on. */
export type MenuTarget = {
    readonly kind: 'link';
    readonly url: string;
} | {
    readonly kind: 'file';
    readonly path: string;
    readonly source: FileSource;
} | {
    readonly kind: 'attachment';
    readonly name: string;
    readonly source: 'attachment';
};
/**
 * Attribute the display layer stamps on a chip it shortened, carrying the full
 * path that chip still stands for.
 *
 * It lives here because this module owns the anchor vocabulary, and because it
 * is what keeps the two layers honest about each other: a shortened chip's
 * visible text is a file name, so every path read must come from the stamp
 * instead. `enhance.ts` writes it, `chips.ts` and this module read it.
 */
export declare const FULL_PATH_ATTR = "data-flm-full-path";
/**
 * The text a chip displays, EXCLUDING artwork drawn inside it.
 *
 * `textContent` recurses into the whole subtree, so it reads an SVG's drawn
 * content too — and four pieces of DSH's file-type artwork paint their label
 * with an SVG `<text>` element (`.css` draws the literal letters `CSS`, and
 * `.env`, `.ini`, and `objective-c` do the same). Read that way, a chip
 * carrying such a glyph yields the label glued to the path, which still reads
 * as a path, so the display layer writes it back: the chip grows by one copy of
 * the label every pass, without bound.
 *
 * Content inside an `<svg>` is a picture of text, never the document's text, so
 * no SVG subtree contributes here. That rule is about HTML, not about this
 * plugin's own markup, which is why nothing here needs to know which glyphs
 * exist; the rest of the tree is walked, because a produced chip's name
 * legitimately lives in a `<span>` beside its glyph.
 * @param element - the chip control.
 * @returns the concatenated text outside every SVG, trimmed.
 */
export declare function chipTextOf(element: Element): string;
/**
 * The attachment name one card or reference carries, when it is an attachment.
 *
 * Three surfaces draw one: the transcript's attachment row, the composer's
 * pending-attachment rail, and a chip for a pasted file, which names the paste
 * by its file name alone. The first two put the display name on the card's
 * `title` and neither carries a path, so a name with a separator in it is a
 * different surface's path chip (the deliverable and mention anchors) rather
 * than an attachment.
 * @param node - the event target's element, if any.
 * @returns the attachment target, or undefined when this is not an attachment.
 */
export declare function attachmentTargetOf(node: Element | null): MenuTarget | undefined;
/**
 * Whether one string plausibly names a filesystem path.
 *
 * Spaces are allowed: real paths carry them (`…/DSH Desktop-2.0.9.dmg`), and
 * the value usually arrives on `title`, where the renderer put the whole path.
 * Only control characters disqualify a value outright, so prose is kept out by
 * the separator-or-extension test rather than by a whitespace ban.
 * @param value - candidate string.
 * @returns true when it looks like a path rather than a sentence.
 */
export declare function looksLikePath(value: string): boolean;
/** Whether one string is an absolute http(s) URL. */
export declare function httpUrlOf(value: string): string | undefined;
/**
 * Whether one reference token names a pasted attachment.
 * @param value - the undecorated reference token.
 * @returns true when the token is a paste name rather than a path.
 */
export declare function isPasteName(value: string): boolean;
/**
 * The path one `@` reference token carries.
 *
 * A rendered reference chip keeps the whole token on its `title` — `@path`, or
 * `@"path with spaces"` — because that token is also what the chip shows on
 * hover. Every action here needs the token alone.
 * @param title - the chip's title text.
 * @returns the undecorated token, or undefined when the title is not such a token.
 */
export declare function referencePathOf(title: string): string | undefined;
/**
 * Recognize the right-click target.
 * @param node - the event target's element, if any.
 * @param selection - current selection text, for right-clicking a bare URL.
 * @returns the target, or undefined when the event must stay with the shell.
 */
export declare function detectTarget(node: Element | null, selection?: string): MenuTarget | undefined;
//# sourceMappingURL=surfaces.d.ts.map