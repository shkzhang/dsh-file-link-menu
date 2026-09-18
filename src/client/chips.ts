/**
 * The path chips this plugin re-dresses: recognition, and the display name
 * each one shows in place of its path.
 *
 * The shell draws a file path in four places and exposes no slot to change how
 * any of them renders, so the enhancement layer reads the same DOM anchors the
 * menu reads and rewrites the chip in place:
 *
 * - tool call argument: the path button inside a `[data-tool]` card. Its class
 *   local name is `fileLink` under a build-hashed prefix, and the shell puts a
 *   relativized path there as the button's own text, with no `title`.
 * - inline path mention: `code > button[title]` with an accessible label —
 *   what the markdown renderer builds for a token the mention vocabulary
 *   resolved. `title` is the full path and the text is the authored token.
 * - rendered `@` reference: `button[data-ref-chip="file"][title]`, whose
 *   `title` is the whole token (`@path`, or `@"path with spaces"`). A token
 *   that is a paste name (`paster-…`, written by `dsh-auto-paste`) names an
 *   attachment rather than a path and is left alone.
 * - produced file chip: `[data-produced-files-row] button[title]`, which
 *   already prints the basename and draws a coarse category glyph.
 *
 * A delivered file card (`[data-presented-files-row]`) is deliberately not a
 * candidate: it already draws the file-type glyph and the basename.
 *
 * Recognition is narrow on purpose — a chip this module does not recognize
 * keeps the shell's own rendering exactly.
 */
import { FULL_PATH_ATTR, isPasteName, looksLikePath, referencePathOf } from './surfaces.ts'

/** Ids the code artwork bakes into its gradients and clip paths. */
const ICON_ID_TOKEN = /dsh-code-icon-[A-Za-z0-9]+/gu

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
export function scopeIconIds(markup: string, instance: number): string {
  return markup.replace(ICON_ID_TOKEN, id => `${id}-flm${String(instance)}`)
}

/** Which surface a recognized chip belongs to. */
export type ChipShape = 'tool' | 'mention' | 'reference' | 'produced'

/** One recognized chip with the facts the enhancer needs. */
export interface ChipTarget {
  /** The control to re-dress. */
  readonly element: HTMLElement
  /** Which surface this chip is, deciding how its path is read. */
  readonly shape: ChipShape
  /**
   * The full path the chip stands for. Where the shell publishes one it comes
   * from `title`; on a tool button, from the stamp a previous pass left;
   * otherwise from the button's own text.
   */
  readonly path: string
}

/** Attribute marking a chip this plugin already re-dressed. */
export const ENHANCED_ATTR = 'data-flm-enhanced'

/**
 * Attribute marking the glyph this plugin stamped.
 *
 * Declared here rather than beside the glyph builder (`icons.ts`) so the
 * recognition and re-dress layers stay free of the shared primitives module:
 * that module is a browser ESM build importing CSS, which the plugin's own
 * suite cannot load, and the layers under test must not drag it in.
 */
export const ICON_ATTR = 'data-flm-icon'

/**
 * Attribute recording the display name this plugin wrote on a chip.
 *
 * It is what tells the layer's own shortened text from a path the shell wrote
 * afterwards: React rewrites a chip's text whenever its props change, and
 * without that distinction a re-rendered chip would keep showing the name
 * recorded before the change.
 */
export const SHOWN_NAME_ATTR = 'data-flm-shown'

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
export const ICON_PATH_ATTR = 'data-flm-icon-for'

/** Every chip shape, as one selector for a scan pass. */
export const CHIP_SELECTOR = [
  '[data-tool] button[class*="_fileLink"]',
  '[data-produced-files-row] button[title]',
  'code > button[title]',
  'button[data-ref-chip="file"][title]',
].join(', ')

/**
 * Whether one element's class attribute holds a class whose local name ends
 * with this suffix.
 *
 * Chip classes carry a build-hashed prefix (`JXwHVq_fileLink`) and a
 * multi-class element puts the local name anywhere in the list; the local name
 * is the part that survives a rebuild — the same reading `surfaces.ts` applies
 * to the composer rail.
 * @param node - element to test.
 * @param suffix - local-name suffix, leading underscore included.
 * @returns true when the class list holds a matching local name.
 */
function classNamed(node: Element, suffix: string): boolean {
  const value = node.getAttribute('class')
  if (value === null) return false
  return value.split(/\s+/u).some(name => name.endsWith(suffix))
}

/** Whether a value uses either path separator. */
function hasSeparator(value: string): boolean {
  return value.includes('/') || value.includes('\\')
}

/**
 * The name a chip displays for a path: its last segment.
 *
 * A path with no separator is already a name. Trailing separators (a directory
 * reference) are dropped so a path that had content never renders empty.
 * @param path - the full path the chip stands for.
 * @returns the final path segment, or the input when it names no segment.
 */
export function displayNameOf(path: string): string {
  const trimmed = path.replace(/[/\\]+$/u, '')
  if (trimmed === '') return path
  if (!hasSeparator(trimmed)) return trimmed
  const name = trimmed.slice(Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1)
  return name === '' ? trimmed : name
}

/**
 * The full path one chip stands for, when the chip is one this plugin owns.
 *
 * A tool button prints a relativized path — enough to act on, but the stamp a
 * previous pass left is preferred so an already-shortened chip keeps reporting
 * the real path. The other shapes publish the author's path on `title`, except
 * a reference chip, whose `title` is the whole `@` token and is undecorated
 * through `referencePathOf`.
 * @param element - candidate chip control.
 * @param shape - the surface it belongs to.
 * @returns the path, or undefined when this chip carries none.
 */
function pathOf(element: HTMLElement, shape: ChipShape): string | undefined {
  if (shape === 'reference') {
    // A rendered `@` reference keeps the whole token on its `title`, and that
    // title is not rewritten by the display layer, so it stays the source.
    const token = referencePathOf((element.getAttribute('title') ?? '').trim())
    // A paste names an attachment, and a token that is not path-shaped names no
    // file: neither gets a file-type glyph.
    if (token === undefined || isPasteName(token)) return undefined
    return hasSeparator(token) || looksLikePath(token) ? token : undefined
  }
  const title = (element.getAttribute('title') ?? '').trim()
  const text = (element.textContent ?? '').trim()
  const stamped = element.getAttribute(FULL_PATH_ATTR)
  const shown = element.getAttribute(SHOWN_NAME_ATTR)
  // The shell rewrote this chip's text after this layer shortened it — React
  // does that whenever a prop changes, and a streaming call's arguments grow
  // character by character. The stamp is stale, so the visible text is the
  // path again; it is preferred over the stamp rather than hidden by it.
  if (stamped !== null && stamped !== '' && shown !== null && shown !== '' && text !== shown
    && looksLikePath(text)) {
    return text
  }
  if (stamped !== null && stamped !== '') return stamped
  if (title !== '' && looksLikePath(title)) return title
  if (shape !== 'tool') return undefined
  return looksLikePath(text) ? text : undefined
}

/**
 * Whether one node has the element members this module reads.
 *
 * A shape test rather than `instanceof`: a node from another realm carries the
 * same members without sharing this realm's constructors.
 * @param node - node to test.
 * @returns true when the node can be queried and read as an element.
 */
function isElement(node: Element | null): node is HTMLElement {
  if (node === null) return false
  const candidate = node as Partial<HTMLElement>
  return typeof candidate.closest === 'function'
    && typeof candidate.getAttribute === 'function'
    && typeof candidate.querySelector === 'function'
}

/**
 * Recognize the chip one element is, if any.
 * @param element - element a scan pass found under {@link CHIP_SELECTOR}.
 * @returns the chip target, or undefined when this is not one of our shapes.
 */
export function recognizeChip(element: Element | null): ChipTarget | undefined {
  if (!isElement(element)) return undefined
  const shape: ChipShape | undefined = element.closest('[data-tool]') !== null
    && classNamed(element, '_fileLink')
    ? 'tool'
    : element.closest('[data-produced-files-row]') !== null
      ? 'produced'
      : element.dataset.refChip === 'file'
        ? 'reference'
        // Inline mentions are the remaining `button[title]` the markdown
        // renderer builds with a path and an accessible label; every other
        // button keeps its rendering.
        : element.parentElement?.tagName === 'CODE' && element.getAttribute('aria-label') !== null
          ? 'mention'
          : undefined
  if (shape === undefined) return undefined
  const path = pathOf(element, shape)
  return path === undefined ? undefined : { element, shape, path }
}
