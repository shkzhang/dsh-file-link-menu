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
import {
  CHIP_SELECTOR, ENHANCED_ATTR, ICON_ATTR, ICON_PATH_ATTR, SHOWN_NAME_ATTR, displayNameOf, recognizeChip,
} from './chips.ts'
import { FULL_PATH_ATTR } from './surfaces.ts'

/**
 * Subtrees an initial pass scans, in order of specificity: the Chat flow when
 * it is mounted, otherwise the application root. Every one that exists is
 * scanned, because a Session switch can leave the flow unmounted while the
 * next one mounts.
 */
const SCAN_ROOTS = '[data-chat-flow], #root'

/** `Node.TEXT_NODE`, inlined: this layer must not read a DOM global. */
const TEXT_NODE = 3

/**
 * Locate the text node a chip's path lives in.
 *
 * The shell renders the path as text in one of two places: directly in the
 * control (a tool card's path button, an inline mention), or in the trailing
 * element the chip draws beside its own glyph (a produced chip's name span).
 * Only those two positions are considered — anything else is left alone rather
 * than searched for, so a chip whose markup a later release reshapes stops
 * being re-dressed instead of being rewritten somewhere unintended.
 * @param element - chip control.
 * @returns the text node, or null when the chip holds no recognized text.
 */
function textNodeOf(element: Element): Text | null {
  const own = directTextOf(element)
  if (own !== null) return own
  for (const child of element.children) {
    const nested = directTextOf(child)
    if (nested !== null) return nested
  }
  return null
}

/**
 * The first non-blank text node among one element's direct children.
 * @param element - element to read.
 * @returns the text node, or null when the element holds none.
 */
function directTextOf(element: Element): Text | null {
  for (const node of element.childNodes) {
    if (node.nodeType === TEXT_NODE && (node.nodeValue ?? '').trim() !== '') return node as Text
  }
  return null
}

/**
 * Re-dress one chip: ensure its glyph, and shorten its path text.
 *
 * The path comes from the stamp when one is present, so a chip already showing
 * a short name is never re-read as though that name were the whole path.
 * @param element - candidate chip control.
 * @param glyph - builds one glyph element for a path, or null when unavailable.
 * @returns true when this pass changed the chip.
 */
function applyChip(element: Element, glyph: (path: string) => Element | null): boolean {
  const target = recognizeChip(element)
  if (target === undefined) return false
  const { path } = target
  const text = textNodeOf(element)
  const icon = element.querySelector(`[${ICON_ATTR}]`)
  let changed = false
  // Rebuilt when absent AND when the file type behind it moved: a produced
  // chip's name lives in a span React updates alone, so its glyph would
  // otherwise keep describing the file the chip used to name.
  if (icon === null || element.getAttribute(ICON_PATH_ATTR) !== path) {
    const built = glyph(path)
    if (built !== null) {
      // Leading, at the chip's own level: a chip reads [glyph][name] whether
      // its name sits in the control (a tool path button, a mention) or in the
      // span beside the glyph the shell already draws (a produced chip). Any
      // glyph the shell draws is hidden by the sheet rather than removed —
      // React still owns that node, and taking it out would leave the virtual
      // DOM and the document disagreeing.
      icon?.remove()
      element.insertBefore(built, element.firstChild)
      element.setAttribute(ICON_PATH_ATTR, path)
      changed = true
    }
  }
  const name = displayNameOf(path)
  if (text !== null && text.nodeValue !== name) {
    text.nodeValue = name
    changed = true
  }
  // Recorded so the next pass can tell this layer's own shortening from a path
  // the shell wrote afterwards.
  if (text !== null && element.getAttribute(SHOWN_NAME_ATTR) !== name) {
    element.setAttribute(SHOWN_NAME_ATTR, name)
    changed = true
  }
  // Stamped even when no glyph could be built: the full path is what keeps the
  // menu and later passes honest about what this chip stands for.
  if (element.getAttribute(FULL_PATH_ATTR) !== path) {
    element.setAttribute(FULL_PATH_ATTR, path)
    changed = true
  }
  if (changed) element.setAttribute(ENHANCED_ATTR, '')
  return changed
}

/**
 * Re-dress every chip at, above, or under one node.
 *
 * The node is a mutation target, and React's updates land in different places
 * for different chip shapes: a tool path button's own children are rebuilt (a
 * `childList` record whose target IS the button), while a produced chip's name
 * is rewritten inside its span (a record whose target is the span, with the
 * button as its ancestor). Walking up to the nearest chip and then down through
 * its subtree covers both without rescanning the conversation.
 * @param node - mutation target or scan root.
 * @param glyph - glyph builder.
 */
function applyRegion(node: Node, glyph: (path: string) => Element | null): void {
  // Duck-typed rather than `instanceof Element`: a node from another realm —
  // an iframe, a test document torn down between frames — carries the same
  // members without sharing this realm's constructors, and a shape test keeps
  // the pass working there instead of throwing inside an observer callback.
  const start = isElement(node) ? node : node.parentElement
  if (start === null || start === undefined) return
  // The chip this target belongs to, when the target sits inside one: a record
  // may land on the chip itself or anywhere within it.
  const owner = start.closest(CHIP_SELECTOR)
  if (isElement(owner)) applyChip(owner, glyph)
  else if (isElement(start)) applyChip(start, glyph)
  for (const chip of start.querySelectorAll(CHIP_SELECTOR)) {
    if (isElement(chip)) applyChip(chip, glyph)
  }
}

/**
 * Whether one node has the element members this layer uses.
 * @param node - node to test.
 * @returns true when the node can be queried and matched.
 */
function isElement(node: Node | null | undefined): node is Element {
  if (node === null || node === undefined) return false
  const candidate = node as Partial<Element>
  return typeof candidate.matches === 'function'
    && typeof candidate.querySelectorAll === 'function'
    && typeof candidate.getAttribute === 'function'
}

/** Handle returned by {@link attachChipEnhancement}. */
export interface ChipEnhancement {
  /** Re-dress every chip currently on the page. */
  scan(): void
  /** Stop watching; chips already re-dressed keep their rendering. */
  dispose(): void
}

/**
 * Watch the document and re-dress every path chip it holds.
 *
 * A commit touches many chips at once and a streaming turn commits
 * continuously, so the pending regions collapse onto one pass per frame.
 * @param glyph - builds one glyph element for a path, or null when unavailable.
 * @returns the scan/dispose handle.
 */
export function attachChipEnhancement(glyph: (path: string) => Element | null): ChipEnhancement {
  const pending = new Set<Node>()
  let frame: number | null = null
  let disposed = false

  const flush = (): void => {
    frame = null
    if (disposed) return
    const regions = [...pending]
    pending.clear()
    for (const node of regions) applyRegion(node, glyph)
  }

  const schedule = (node: Node): void => {
    pending.add(node)
    if (frame !== null) return
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(flush)
    else if (typeof setTimeout === 'function') frame = setTimeout(flush, 0) as unknown as number
  }

  const scan = (): void => {
    // A frame already queued when the document is torn down reaches here with
    // no document to read; that is not a failure worth throwing inside an
    // observer callback, so the pass simply ends.
    if (typeof document === 'undefined' || document.body === null) return
    for (const root of document.querySelectorAll(SCAN_ROOTS)) applyRegion(root, glyph)
  }

  // An environment without MutationObserver (an embedded webview, a stripped
  // test worker) still gets the chips that exist when the layer attaches; only
  // the re-dress after later commits is lost.
  const observer = typeof MutationObserver === 'function' ? new MutationObserver((records) => {
    for (const record of records) schedule(record.target)
  }) : null
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true })

  scan()
  return {
    scan,
    dispose: () => {
      disposed = true
      observer?.disconnect()
      if (frame !== null) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
        else clearTimeout(frame)
        frame = null
      }
    },
  }
}

/** Re-exported for the callers that install the layer. */
export { ENHANCED_ATTR, FULL_PATH_ATTR }
