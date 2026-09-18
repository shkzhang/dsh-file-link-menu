/**
 * The file-type glyph stamped onto a path chip.
 *
 * The glyph is DSH's own artwork: `FileTypeIcon` from the shared
 * `@deepseek-ai/dsh-client-ui-primitives` module the shell seeds into its
 * module table (the same module the menu already draws its chrome from).
 * Reusing it keeps one artwork owner — a `.tsx` chip shows the React mark, a
 * `.md` chip the Markdown mark, and a category a later shell release adds
 * appears without a change here.
 *
 * Markup is rendered once per file type into a detached React root and cached.
 * Two details make that cache safe:
 *
 * - `useId` answers the SAME value on every render into a reused root, so a
 *   code type whose artwork carries gradients would emit one id for every chip
 *   on the page. `url(#…)` resolves to the first match in the document, so
 *   removing that first chip would strip the fill from all the others. Each
 *   instance therefore mints its own ids.
 * - The root stays detached, so this render never touches the page's own React
 *   tree.
 *
 * A composition without the primitive gets no glyph; the chip keeps its text,
 * which is what the chip is for.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { FileTypeIcon, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives'
import { ICON_ATTR, scopeIconIds } from './chips.ts'

export { ICON_ATTR }

/** Size handed to the primitive; the chip's stylesheet scales the glyph. */
const RENDER_SIZE = 16

/**
 * Instance counter behind every glyph id this layer mints.
 *
 * It is monotonic for the page rather than per factory: a hot reload builds a
 * new factory while the glyphs the previous one stamped are still in the
 * document, and a counter restarting at 1 would mint ids that collide with
 * those. The counter only ever grows, so a new instance can never reuse an id
 * an older one may still own.
 */
let instanceCounter = 0

/** One glyph factory's cache and its single detached render root. */
class IconFactory {
  private readonly cache = new Map<string, string>()
  private holder: HTMLDivElement | null = null
  private root: Root | null = null

  /**
   * Markup for one file type, built once and shared by every later chip.
   * @param path - file path the type is classified from.
   * @returns the markup, or undefined when no glyph can be built.
   */
  private markupFor(path: string): string | undefined {
    if (typeof FileTypeIcon !== 'function') return undefined
    let type: string
    try {
      type = classifyFileType(path)
    } catch {
      // The glyph is decoration; the chip's own text stands without it.
      return undefined
    }
    const cached = this.cache.get(type)
    if (cached !== undefined) return cached
    this.holder ??= document.createElement('div')
    this.root ??= createRoot(this.holder)
    try {
      flushSync(() => { this.root?.render(createElement(FileTypeIcon, { path, size: RENDER_SIZE })) })
    } catch {
      // A primitive that refuses the props leaves the chip text-only, the same
      // posture every other failure in this plugin takes.
      return undefined
    }
    const markup = this.holder.innerHTML
    if (markup === '') return undefined
    this.cache.set(type, markup)
    return markup
  }

  /**
   * Build one glyph element whose ids are unique to this instance.
   * @param path - file path the type is classified from.
   * @returns the element, or null when no glyph can be built.
   */
  elementFor(path: string): Element | null {
    const markup = this.markupFor(path)
    if (markup === undefined) return null
    const holder = document.createElement('div')
    instanceCounter += 1
    holder.innerHTML = scopeIconIds(markup, instanceCounter)
    const element = holder.firstElementChild
    if (element === null) return null
    element.setAttribute(ICON_ATTR, '')
    return element
  }
}

/**
 * Build a glyph builder backed by one cache.
 * @returns a function answering one glyph element per path, or null when it cannot.
 */
export function createIconFactory(): (path: string) => Element | null {
  const factory = new IconFactory()
  return path => factory.elementFor(path)
}
