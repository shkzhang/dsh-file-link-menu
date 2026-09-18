// @vitest-environment jsdom
/**
 * The display layer: recognition, the name it shows, and the re-dress pass.
 *
 * Each case builds the DOM the shell actually renders for one surface (the
 * anchors are documented in `chips.ts`) and asserts both what changed and what
 * must NOT change — the layer's whole safety argument is that an unrecognized
 * chip keeps the shell's rendering exactly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHIP_SELECTOR, ENHANCED_ATTR, ICON_ATTR, ICON_PATH_ATTR, displayNameOf, recognizeChip, scopeIconIds,
} from '../src/client/chips.ts'
import { FULL_PATH_ATTR } from '../src/client/surfaces.ts'
import { attachChipEnhancement, type ChipEnhancement } from '../src/client/enhance.ts'

/** Build one element tree from HTML and return the deepest element. */
function deepest(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  let node: Element = host
  while (node.lastElementChild !== null) node = node.lastElementChild
  return node as HTMLElement
}

/** A glyph builder standing in for the shared primitive. */
function stubGlyph(): (path: string) => Element | null {
  return (path: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute(ICON_ATTR, '')
    svg.setAttribute('data-type', path.slice(path.lastIndexOf('.') + 1))
    return svg
  }
}

/**
 * Let the layer see DOM writes made by a test.
 *
 * A MutationObserver callback is a microtask, and the layer coalesces onto an
 * animation frame (jsdom schedules one off a real ~16ms timer), so this waits
 * through both.
 */
async function settle(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>(resolve => { setTimeout(resolve, 32) })
  // One more turn: the flush may itself schedule work (a reused chip whose
  // children React rebuilt in the same batch).
  await Promise.resolve()
  await new Promise<void>(resolve => { setTimeout(resolve, 32) })
}

/** Enhancements this case attached, disposed after it whatever it asserted. */
const attached: ChipEnhancement[] = []

/**
 * Attach the layer under test, registered for cleanup.
 *
 * `afterEach` disposes unconditionally: a case that fails mid-way would
 * otherwise leave an observer watching the document, and the next case's chips
 * would be re-dressed by the previous case's layer.
 * @param glyph - glyph builder for this case.
 * @returns the attachment.
 */
function attach(glyph: (path: string) => Element | null): ChipEnhancement {
  const enhancement = attachChipEnhancement(glyph)
  attached.push(enhancement)
  return enhancement
}

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => {
  for (const enhancement of attached.splice(0)) enhancement.dispose()
  vi.useRealTimers()
})

describe('displayNameOf', () => {
  it('keeps the last segment of a POSIX path', () => {
    expect(displayNameOf('plugins/dsh-desktop/src/profile.ts')).toBe('profile.ts')
  })

  it('keeps the last segment of a Windows path', () => {
    expect(displayNameOf('C:\\work\\ws\\src\\main.tsx')).toBe('main.tsx')
  })

  it('returns a bare name unchanged', () => {
    expect(displayNameOf('profile.ts')).toBe('profile.ts')
  })

  it('drops trailing separators on a directory reference', () => {
    expect(displayNameOf('src/components/')).toBe('components')
  })

  it('keeps an absolute root unchanged rather than rendering empty', () => {
    expect(displayNameOf('/')).toBe('/')
  })
})

describe('recognizeChip', () => {
  it('recognizes a tool card path button by its hashed class', () => {
    const node = deepest('<div data-tool="read"><div class="JXwHVq_row"><button type="button" class="JXwHVq_fileLink">plugins/a/b/profile.ts</button></div></div>')
    expect(recognizeChip(node)).toMatchObject({
      shape: 'tool',
      path: 'plugins/a/b/profile.ts',
    })
  })

  it('reads the stamp before the text on an already-shortened tool chip', () => {
    const node = deepest('<div data-tool="read"><button class="X_fileLink" data-flm-full-path="plugins/a/b/profile.ts">profile.ts</button></div>')
    // The visible text is a bare name; acting on it would open the wrong file.
    expect(recognizeChip(node)?.path).toBe('plugins/a/b/profile.ts')
  })

  it('recognizes an inline mention and keeps the full path from its title', () => {
    const node = deepest('<p><code><button class="fileMention" title="/w/src/a.ts" aria-label="open a.ts">src/a.ts</button></code></p>')
    expect(recognizeChip(node)).toMatchObject({ shape: 'mention', path: '/w/src/a.ts' })
  })

  it('recognizes a produced chip', () => {
    const node = deepest('<div data-produced-files-row><button title="/w/src/b.ts"><svg></svg><span>src/b.ts</span></button></div>').closest('button')
    expect(recognizeChip(node)).toMatchObject({ shape: 'produced', path: '/w/src/b.ts' })
  })

  it('recognizes a rendered @ reference and undecorates its token', () => {
    const node = deepest('<p><button data-ref-chip="file" title="@src/a.ts">@src/a.ts</button></p>')
    expect(recognizeChip(node)).toMatchObject({ shape: 'reference', path: 'src/a.ts' })
  })

  it('unwraps a quoted @ reference token', () => {
    const node = deepest('<p><button data-ref-chip="file" title="@&quot;src/my file.ts&quot;">src/my file.ts</button></p>')
    expect(recognizeChip(node)?.path).toBe('src/my file.ts')
  })

  it('leaves a paste reference alone: it names an attachment, not a path', () => {
    const node = deepest('<p><button data-ref-chip="file" title="@paster-1730000000.txt">paster-1730000000.txt</button></p>')
    expect(recognizeChip(node)).toBeUndefined()
  })

  it('leaves a slash reference alone', () => {
    const node = deepest('<p><button data-ref-chip="skill" title="@explain">/explain</button></p>')
    expect(recognizeChip(node)).toBeUndefined()
  })

  it('leaves a delivered file card alone: it already draws a glyph and a name', () => {
    const node = deepest('<div data-presented-files-row><button title="/w/README.md"><svg></svg><span>README.md</span></button></div>')
    expect(recognizeChip(node)).toBeUndefined()
  })

  it('leaves an ordinary prose button alone', () => {
    const node = deepest('<p><button title="a sentence about files">click</button></p>')
    expect(recognizeChip(node)).toBeUndefined()
  })

  it('leaves a path-shaped word that is not a chip alone', () => {
    const node = deepest('<div><button class="some_other">src/a.ts</button></div>')
    expect(recognizeChip(node)).toBeUndefined()
  })
})

describe('attachChipEnhancement', () => {
  /** Build the conversation flow with one tool chip inside it. */
  function flow(markup: string): HTMLElement {
    const host = document.createElement('div')
    host.setAttribute('data-chat-flow', '')
    host.innerHTML = markup
    document.body.append(host)
    return host
  }

  it('re-dresses every chip shape and leaves the rest of the document alone', () => {
    flow(`
      <div data-tool="read"><button class="A_fileLink">plugins/a/b/profile.ts</button></div>
      <p><code><button title="/w/src/a.ts" aria-label="open">src/a.ts</button></code></p>
      <div data-produced-files-row><button title="/w/src/b.ts"><svg class="theirs"></svg><span>src/b.ts</span></button></div>
      <p><button title="plain prose">click</button></p>
    `)
    const enhancement = attach(stubGlyph())
    const [tool, mention, produced, plain] = [...document.querySelectorAll<HTMLElement>('button')]

    expect(tool?.textContent).toBe('profile.ts')
    expect(tool?.getAttribute(FULL_PATH_ATTR)).toBe('plugins/a/b/profile.ts')
    expect(tool?.querySelector(`[${ICON_ATTR}]`)).not.toBeNull()

    expect(mention?.textContent).toBe('a.ts')
    expect(mention?.getAttribute(FULL_PATH_ATTR)).toBe('/w/src/a.ts')

    expect(produced?.textContent).toBe('b.ts')
    expect(produced?.getAttribute(FULL_PATH_ATTR)).toBe('/w/src/b.ts')

    // Untouched: no glyph, no stamp, original text.
    expect(plain?.textContent).toBe('click')
    expect(plain?.getAttribute(FULL_PATH_ATTR)).toBeNull()
    expect(plain?.querySelector(`[${ICON_ATTR}]`)).toBeNull()

    enhancement.dispose()
  })

  it('is idempotent: a second pass adds no second glyph', () => {
    flow('<div data-tool="read"><button class="A_fileLink">a/b/c.ts</button></div>')
    const enhancement = attach(stubGlyph())
    enhancement.scan()
    enhancement.scan()
    const button = document.querySelector('button')
    expect(button?.querySelectorAll(`[${ICON_ATTR}]`)).toHaveLength(1)
    expect(button?.textContent).toBe('c.ts')
    enhancement.dispose()
  })

  it('keeps the shell\'s own glyph element in the tree, so React still owns it', () => {
    flow('<div data-produced-files-row><button title="/w/src/b.ts"><svg class="theirs"></svg><span>src/b.ts</span></button></div>')
    const enhancement = attach(stubGlyph())
    const button = document.querySelector('button')
    expect(button?.querySelector('svg.theirs')).not.toBeNull()
    expect(button?.querySelector(`[${ICON_ATTR}]`)).not.toBeNull()
    enhancement.dispose()
  })

  it('re-dresses a chip the shell rewrites afterwards', async () => {
    const host = flow('<div data-tool="read"><button class="A_fileLink">a/b/c.ts</button></div>')
    const enhancement = attach(stubGlyph())
    const button = document.querySelector('button') as HTMLButtonElement
    expect(button.textContent).toBe('c.ts')

    // React rewrites the path and rebuilds the button's children, which is what
    // a changed prop does; the layer must restore the rendering.
    button.textContent = 'plugins/x/y/other-file.ts'
    await settle()

    expect(button.textContent).toBe('other-file.ts')
    expect(button.getAttribute(FULL_PATH_ATTR)).toBe('plugins/x/y/other-file.ts')
    expect(button.querySelectorAll(`[${ICON_ATTR}]`)).toHaveLength(1)
    enhancement.dispose()
    expect(host.isConnected).toBe(true)
  })

  it('stops re-dressing once disposed, leaving what it already re-dressed', async () => {
    flow('<div data-tool="read"><button class="A_fileLink">a/b/c.ts</button></div>')
    const enhancement = attach(stubGlyph())
    const button = document.querySelector('button') as HTMLButtonElement
    // The initial pass already shortened this chip; disposing does not undo it.
    expect(button.textContent).toBe('c.ts')
    enhancement.dispose()

    // A later shell write is left exactly as written: nothing is watching, so
    // no glyph is stamped and no path is shortened. The stale stamp is the only
    // trace, and it is what the next mount's pass reads as stale and replaces.
    button.textContent = 'a/b/untouched.ts'
    await settle()
    expect(button.textContent).toBe('a/b/untouched.ts')
    expect(button.getAttribute(FULL_PATH_ATTR)).toBe('a/b/c.ts')
  })

  it('leaves every chip intact when no glyph can be built', () => {
    flow('<div data-tool="read"><button class="A_fileLink">a/b/c.ts</button></div>')
    const enhancement = attach(() => null)
    const button = document.querySelector('button')
    // The stamp still lands: the menu must keep resolving the real file even
    // when the glyph is unavailable.
    expect(button?.getAttribute(FULL_PATH_ATTR)).toBe('a/b/c.ts')
    expect(button?.querySelector(`[${ICON_ATTR}]`)).toBeNull()
    enhancement.dispose()
  })

  it('finds every chip shape through its own selector', () => {
    flow(`
      <div data-tool="read"><button class="A_fileLink">a/b/c.ts</button></div>
      <p><code><button title="/w/src/a.ts" aria-label="open">src/a.ts</button></code></p>
      <div data-produced-files-row><button title="/w/src/b.ts"><span>src/b.ts</span></button></div>
      <p><button data-ref-chip="file" title="@src/d.ts">@src/d.ts</button></p>
    `)
    expect(document.querySelectorAll(CHIP_SELECTOR)).toHaveLength(4)
  })
})

describe('scopeIconIds', () => {
  /**
   * Many code types' artwork carries gradients and clip paths whose ids are
   * baked into the markup and referenced by `url(#…)`. `useId` answers the same
   * value on every render into the reused cache root, so without scoping two
   * chips of one type would share ids and removing the first would strip the
   * fill from the rest.
   */
  const artwork = '<svg><linearGradient id="dsh-code-icon-r0a"/><linearGradient id="dsh-code-icon-r0b"/>'
    + '<path fill="url(#dsh-code-icon-r0a)"/><path fill="url(#dsh-code-icon-r0b)"/></svg>'
  const idsOf = (markup: string): string[] =>
    [...markup.matchAll(/id="([^"]+)"/gu)].map(match => match[1] ?? '')

  it('keeps the several ids within one glyph distinct from each other', () => {
    const scoped = scopeIconIds(artwork, 1)
    // A whole-token replacement would collapse both gradients onto one id and
    // leave one of the two `url(#…)` references dangling.
    expect(idsOf(scoped)).toHaveLength(2)
    expect(new Set(idsOf(scoped)).size).toBe(2)
  })

  it('gives two instances of one type ids that do not collide', () => {
    const both = [...idsOf(scopeIconIds(artwork, 1)), ...idsOf(scopeIconIds(artwork, 2))]
    expect(new Set(both).size).toBe(both.length)
  })

  it('rewrites the references in step with the ids they point at', () => {
    const scoped = scopeIconIds(artwork, 7)
    for (const id of idsOf(scoped)) expect(scoped).toContain(`url(#${id})`)
  })

  it('leaves markup without embedded ids untouched', () => {
    const plain = '<svg><path d="M0 0"/></svg>'
    expect(scopeIconIds(plain, 3)).toBe(plain)
  })
})

describe('the shell glyph hide rule', () => {
  /**
   * The stylesheet selects the flag the layer stamps, and it is the only thing
   * that hides the glyph the shell draws beside our own. It is asserted here
   * rather than in a browser because the attribute is a contract between two
   * files, and a rename on either side would silently show two glyphs.
   */
  it('stamps the flag the sheet selects', async () => {
    const host = document.createElement('div')
    host.setAttribute('data-chat-flow', '')
    host.innerHTML = '<div data-produced-files-row><button title="/w/src/b.ts"><svg class="theirs"></svg><span>src/b.ts</span></button></div>'
    document.body.append(host)
    const enhancement = attach(stubGlyph())
    await settle()
    const button = host.querySelector('button')
    expect(button?.getAttribute(ENHANCED_ATTR)).toBe('')
    // The sheet's own selectors, as the build compiles them.
    expect(button?.matches(`[${ENHANCED_ATTR}]`)).toBe(true)
    expect(button?.querySelector(`svg.theirs:not([${ICON_ATTR}])`)).not.toBeNull()
    enhancement.dispose()
  })
})

describe('glyph follows the file type', () => {
  /**
   * A produced chip draws its name in a span, so React updates that span alone
   * when the path changes and the button's own children — including the glyph
   * this layer inserted — are never touched. Without tracking which path the
   * glyph was built for, the chip would keep showing the previous file's type.
   */
  it('rebuilds the glyph when the path changes type', async () => {
    const host = document.createElement('div')
    host.setAttribute('data-chat-flow', '')
    document.body.append(host)
    const paint = (path: string): void => {
      host.innerHTML = `<div data-produced-files-row><button title="${path}">`
        + `<svg class="theirs"></svg><span>${path}</span></button></div>`
    }
    paint('/w/src/component.tsx')
    const enhancement = attach(stubGlyph())
    await settle()

    let button = host.querySelector('button') as HTMLButtonElement
    expect(button.querySelector(`[${ICON_ATTR}]`)?.getAttribute('data-type')).toBe('tsx')
    expect(button.getAttribute(ICON_PATH_ATTR)).toBe('/w/src/component.tsx')

    // The shell repaints the row for a different file: React rewrites the span
    // and leaves the button's children alone, which is what this case models by
    // replacing only the span's text and the title.
    button.title = '/w/docs/notes.md'
    const span = button.querySelector('span') as HTMLSpanElement
    span.textContent = 'notes.md'
    await settle()

    button = host.querySelector('button') as HTMLButtonElement
    expect(button.querySelectorAll(`[${ICON_ATTR}]`)).toHaveLength(1)
    expect(button.querySelector(`[${ICON_ATTR}]`)?.getAttribute('data-type')).toBe('md')
    expect(button.textContent).toBe('notes.md')
    enhancement.dispose()
  })
})
