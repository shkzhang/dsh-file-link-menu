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
export type FileSource = 'presented' | 'produced' | 'mention' | 'tool' | 'attachment'

/** What the menu acts on. */
export type MenuTarget =
  | { readonly kind: 'link'; readonly url: string }
  | { readonly kind: 'file'; readonly path: string; readonly source: FileSource }
  | { readonly kind: 'attachment'; readonly name: string; readonly source: 'attachment' }

/** Anchors owned by the shell's deliverable region. */
const PRESENTED_ROW = '[data-presented-files-row]'
const PRODUCED_ROW = '[data-produced-files-row]'

/** The transcript's attachment row. */
const MESSAGE_ATTACHMENTS = '[data-message-attachments]'

/**
 * Whether one element's class attribute holds a class whose local name ends
 * with this suffix.
 *
 * The composer rail is styled by CSS modules, so its class names carry a
 * build-hashed prefix (`Qs40hG_card`) and a multi-class element puts the local
 * name anywhere in the list; the local name is the part that survives a
 * rebuild.
 */
function classNamed(node: Element, suffix: string): boolean {
  const value = node.getAttribute('class')
  if (value === null) return false
  return value.split(/\s+/u).some(name => name.endsWith(suffix))
}

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
export function attachmentTargetOf(node: Element | null): MenuTarget | undefined {
  if (node == null) return undefined
  const chip = chipTargetOf(node)
  if (chip !== undefined) return chip.kind === 'attachment' ? chip : undefined
  const card = node.closest(MESSAGE_ATTACHMENTS) !== null
    ? node.closest<HTMLElement>(`${MESSAGE_ATTACHMENTS} [title]`)
    : composerCardOf(node)
  if (card == null) return undefined
  const name = (card.getAttribute('title') ?? '').trim()
  if (name.length === 0 || name.includes('/') || name.includes('\\')) return undefined
  return { kind: 'attachment', name, source: 'attachment' }
}

/**
 * The composer rail's attachment card under one element.
 *
 * The rail is the labelled group the shell's attachment strip builds, one item
 * per pending attachment, and the card inside the item is what carries the
 * name. The same rail also holds image thumbnails, so the card is recognized
 * by that three-level position rather than by any class of its own.
 */
function composerCardOf(node: Element): HTMLElement | undefined {
  const card = node.closest<HTMLElement>('[title][class]')
  if (card == null || !classNamed(card, '_card')) return undefined
  const item = card.parentElement
  if (item == null || !classNamed(item, '_item')) return undefined
  const rail = item.parentElement
  if (rail == null || !classNamed(rail, '_rail') || rail.getAttribute('role') !== 'group') return undefined
  return card
}

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
export function looksLikePath(value: string): boolean {
  if (value.length === 0 || value.length > 4096) return false
  if (/[\u0000-\u001f]/u.test(value)) return false
  const trimmed = value.trim()
  return trimmed.includes('/') || trimmed.includes('\\') || /\.[A-Za-z0-9]{1,8}$/u.test(trimmed)
}

/** Whether one string is an absolute http(s) URL. */
export function httpUrlOf(value: string): string | undefined {
  const trimmed = value.trim()
  if (!/^https?:\/\//iu.test(trimmed)) return undefined
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * The name convention a pasted attachment carries, as `dsh-auto-paste` writes
 * it: `paster-<timestamp>.txt`. One pasted file is referenced by that name
 * alone, so the prefix is what tells such a reference from a workspace path.
 */
const PASTE_NAME = /^paster-[^\s/\\]{1,240}$/u

/**
 * Whether one reference token names a pasted attachment.
 * @param value - the undecorated reference token.
 * @returns true when the token is a paste name rather than a path.
 */
export function isPasteName(value: string): boolean {
  return PASTE_NAME.test(value)
}

/**
 * The path one `@` reference token carries.
 *
 * A rendered reference chip keeps the whole token on its `title` — `@path`, or
 * `@"path with spaces"` — because that token is also what the chip shows on
 * hover. Every action here needs the token alone.
 * @param title - the chip's title text.
 * @returns the undecorated token, or undefined when the title is not such a token.
 */
export function referencePathOf(title: string): string | undefined {
  const token = title.trim()
  if (!token.startsWith('@')) return undefined
  const body = token.slice(1)
  if (!body.startsWith('"')) return body.length === 0 ? undefined : body
  return body.length >= 3 && body.endsWith('"') ? body.slice(1, -1) : undefined
}

/** One recognized reference chip, with the token it carries. */
interface ReferenceChip {
  readonly chip: HTMLElement
  readonly token: string
}

/** The reference chip under one element, when it is a file reference. */
function referenceChipOf(node: Element | null): ReferenceChip | undefined {
  const chip = node?.closest<HTMLElement>('button[data-ref-chip="file"][title]')
  if (chip == null) return undefined
  const token = referencePathOf(chip.title)
  return token === undefined ? undefined : { chip, token }
}

/**
 * What one reference chip names: a pasted attachment, or a path.
 *
 * A paste is referenced by its file name, which the Host's attachment store
 * turns back into a path; anything else in a chip is a path the same file rows
 * can act on. A token that is neither stays with the shell.
 * @param node - the element a click or a right-click landed on.
 * @returns the target, or undefined when the chip names no file.
 */
function chipTargetOf(node: Element | null): MenuTarget | undefined {
  const found = referenceChipOf(node)
  if (found === undefined) return undefined
  if (isPasteName(found.token)) return { kind: 'attachment', name: found.token, source: 'attachment' }
  return looksLikePath(found.token) ? { kind: 'file', path: found.token, source: 'mention' } : undefined
}

/**
 * The path chip under one element.
 *
 * A mention is `code > button[title]`, and the code element has its own box:
 * a right-click can land on the wrapper, so the button inside the nearest
 * `code` counts as the chip too.
 */
function chipOf(node: Element | null): HTMLElement | undefined {
  const direct = node?.closest<HTMLElement>('button[title]')
  if (direct != null) return direct
  return node?.closest('code')?.querySelector<HTMLElement>('button[title]') ?? undefined
}

/**
 * The file chip under one element, when it is a declared, mentioned, or
 * referenced path.
 */
function fileTargetOf(node: Element | null): MenuTarget | undefined {
  const chip = chipOf(node)
  if (chip == null) return undefined
  // A rendered `@` reference keeps the whole token on its `title`, so its target
  // is read out of the token; `data-ref-chip` is what marks it as one.
  if (chip.dataset.refChip === 'file') return chipTargetOf(node)
  const path = chip.title.trim()
  if (!looksLikePath(path)) return undefined
  if (chip.closest(PRESENTED_ROW) !== null) return { kind: 'file', path, source: 'presented' }
  if (chip.closest(PRODUCED_ROW) !== null) return { kind: 'file', path, source: 'produced' }
  // Inline mentions are the only remaining `button[title]` the renderer builds
  // with a full path and an accessible label; everything else keeps its menu.
  if (chip.getAttribute('aria-label') === null) return undefined
  return { kind: 'file', path, source: 'mention' }
}

/**
 * The path button one tool card renders for the file its call names.
 *
 * A bare basename is deliberately not enough here: the Host resolves a
 * relative path against the workspace root, and resolving an ambiguous
 * basename could open a different file than the card shows.
 */
function toolTargetOf(node: Element | null): MenuTarget | undefined {
  const card = node?.closest('[data-tool]')
  if (card == null) return undefined
  const button = node?.closest('button')
  if (button == null || !card.contains(button)) return undefined
  const path = (button.textContent ?? '').trim()
  // The tool surface carries the path as text, so a separator is required
  // here: a path-shaped word in prose must not become a file target.
  if (!path.includes('/') || !looksLikePath(path)) return undefined
  return { kind: 'file', path, source: 'tool' }
}

/**
 * Recognize the right-click target.
 * @param node - the event target's element, if any.
 * @param selection - current selection text, for right-clicking a bare URL.
 * @returns the target, or undefined when the event must stay with the shell.
 */
export function detectTarget(node: Element | null, selection = ''): MenuTarget | undefined {
  const anchor = node?.closest<HTMLAnchorElement>('a[href]')
  if (anchor != null) {
    // The property is the resolved address, so a same-page `#anchor` or a
    // relative link would read as an absolute URL and steal the shell's own
    // navigation menu. Only the authored value decides.
    const url = httpUrlOf(anchor.getAttribute('href') ?? '')
    return url === undefined ? undefined : { kind: 'link', url }
  }
  const selectionUrl = httpUrlOf(selection)
  if (selectionUrl !== undefined && selection.trim() === selectionUrl) return { kind: 'link', url: selectionUrl }
  return fileTargetOf(node) ?? attachmentTargetOf(node) ?? toolTargetOf(node)
}
