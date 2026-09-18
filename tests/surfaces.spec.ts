// @vitest-environment jsdom
/**
 * Anchor recognition. Each case builds the DOM the shell actually renders for
 * one surface (see the anchors documented in `surfaces.ts`) plus the cases
 * that must stay with the shell's own menu.
 */
import { describe, expect, it } from 'vitest'
import { attachmentTargetOf, detectTarget, httpUrlOf, isPasteName, looksLikePath, referencePathOf } from '../src/client/surfaces.ts'

/** Build one element tree from HTML and return the deepest element. */
function deepest(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  let node: Element = host
  while (node.lastElementChild !== null) node = node.lastElementChild
  return node
}

describe('detectTarget', () => {
  it('claims an external link', () => {
    const node = deepest('<p><a href="https://example.com/a" target="_blank" rel="noopener noreferrer"><span>example</span></a></p>')
    expect(detectTarget(node)).toEqual({ kind: 'link', url: 'https://example.com/a' })
  })

  it('leaves a same-page anchor to the shell', () => {
    const node = deepest('<p><a href="#heading">heading</a></p>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('leaves a relative link to the shell', () => {
    const node = deepest('<p><a href="/docs/guide">guide</a></p>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('claims a delivered file card', () => {
    const node = deepest('<div data-presented-files-row><button title="/tmp/ws/README.md" aria-label="预览 README.md"><span>README.md</span></button></div>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: '/tmp/ws/README.md', source: 'presented' })
  })

  it('claims a produced file chip', () => {
    const node = deepest('<div data-produced-files-row><button title="/tmp/ws/src/a.ts"><span>a.ts</span></button></div>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: '/tmp/ws/src/a.ts', source: 'produced' })
  })

  it('claims an inline path mention', () => {
    const node = deepest('<p><button class="fileMention" title="/tmp/ws/src/b.ts" aria-label="打开 src/b.ts"><span>src/b.ts</span></button></p>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: '/tmp/ws/src/b.ts', source: 'mention' })
  })

  it('leaves a titled button without an accessible label alone', () => {
    const node = deepest('<div><button title="/tmp/ws/src/c.ts"><span>c.ts</span></button></div>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('leaves a non-path title alone', () => {
    const node = deepest('<div><button title="展开更多" aria-label="展开"><span>more</span></button></div>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('claims a tool call argument path', () => {
    const node = deepest('<div data-tool="read_image" data-state="ok"><div role="button"><span><button class="JXwHVq_fileLink">.tmp/iclr-table-references/asid-08.png</button></span></div></div>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: '.tmp/iclr-table-references/asid-08.png', source: 'tool' })
  })

  it('leaves an unstamped basename-only tool argument alone', () => {
    // A bare name with no stamp is not something the Host can resolve against
    // the workspace root without risking a different file than the row shows.
    const node = deepest('<div data-tool="read"><div><button class="JXwHVq_fileLink">AGENTS.md</button></div></div>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('claims a tool chip the display layer shortened, through its stamp', () => {
    // The visible text is a name by then; acting on it would resolve the wrong
    // file, so the stamp the display layer left is the only honest source.
    const node = deepest('<div data-tool="read"><div><button class="JXwHVq_fileLink" data-flm-full-path="docs/guide/AGENTS.md" data-flm-shown="AGENTS.md">AGENTS.md</button></div></div>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: 'docs/guide/AGENTS.md', source: 'tool' })
  })

  it('claims a shortened mention through its stamp', () => {
    const node = deepest('<p><code><button class="fileMention" title="/w/src/deep/a.ts" aria-label="open" data-flm-full-path="/w/src/deep/a.ts">a.ts</button></code></p>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: '/w/src/deep/a.ts', source: 'mention' })
  })

  it('leaves a tool card control alone', () => {
    const node = deepest('<div data-tool="write"><div role="button" aria-label="展开"><span>展开</span></div></div>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('claims a mention whose path contains a space', () => {
    const node = deepest('<p><code><button class="fileMention" title="/w/plugins/dist/DSH Desktop-2.0.9-universal.dmg" aria-label="打开 …"><svg/></button></code></p>')
    expect(detectTarget(node)).toEqual({
      kind: 'file', path: '/w/plugins/dist/DSH Desktop-2.0.9-universal.dmg', source: 'mention',
    })
  })

  it('claims a chip when the right-click lands on its code wrapper', () => {
    const wrapper = deepest('<p><code><button class="fileMention" title="/w/plugins/dist/DSH Desktop.dmg" aria-label="打开 …">x</button></code></p>')
    const code = wrapper.closest('code') as Element
    expect(detectTarget(code)).toEqual({ kind: 'file', path: '/w/plugins/dist/DSH Desktop.dmg', source: 'mention' })
  })

  it('claims a tool argument whose path contains a space', () => {
    const node = deepest('<div data-tool="write"><div><button class="JXwHVq_fileLink">dist/DSH Desktop-2.0.9-universal.dmg</button></div></div>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: 'dist/DSH Desktop-2.0.9-universal.dmg', source: 'tool' })
  })

  it('claims a bare URL selection', () => {
    expect(detectTarget(null, '  https://example.com/doc  ')).toEqual({ kind: 'link', url: 'https://example.com/doc' })
  })

  it('ignores prose that merely contains a URL', () => {
    expect(detectTarget(null, 'see https://example.com for details')).toBeUndefined()
  })

  it('ignores an empty target', () => {
    expect(detectTarget(null)).toBeUndefined()
  })
})

describe('attachment anchors', () => {
  it('claims a transcript attachment card', () => {
    const node = deepest('<div data-message-attachments><span class="PQRcOa_fileCard" title="20260916-112511232.txt"><span class="PQRcOa_fileName">20260916-112511232.txt</span></span></div>')
    expect(detectTarget(node)).toEqual({ kind: 'attachment', name: '20260916-112511232.txt', source: 'attachment' })
  })

  it('claims a composer attachment card', () => {
    const node = deepest('<div class="Qs40hG_root"><div class="Qs40hG_rail" role="group" aria-label="待发送附件"><div class="Qs40hG_item"><div class="oD8biW_card" title="20260916-112511232.txt"><span class="oD8biW_icon">TXT</span></div></div></div></div>')
    expect(detectTarget(node)).toEqual({ kind: 'attachment', name: '20260916-112511232.txt', source: 'attachment' })
  })

  it('claims a failed composer card, whose element carries a second class', () => {
    const node = deepest('<div class="Qs40hG_root"><div class="Qs40hG_rail" role="group"><div class="Qs40hG_item"><div class="oD8biW_card oD8biW_failed" title="a.txt"><span>a.txt</span></div></div></div></div>')
    expect(detectTarget(node)).toEqual({ kind: 'attachment', name: 'a.txt', source: 'attachment' })
  })

  it('leaves a composer card outside a labelled rail alone', () => {
    const node = deepest('<div class="Qs40hG_root"><div class="Qs40hG_rail"><div class="Qs40hG_item"><div class="oD8biW_card" title="a.txt"><span>a.txt</span></div></div></div></div>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('leaves the composer image thumbnail alone', () => {
    const node = deepest('<div class="Qs40hG_root"><div class="Qs40hG_rail" role="group"><div class="Qs40hG_item"><div class="Qs40hG_thumbnail" title="shot.png"><span>shot.png</span></div></div></div></div>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('leaves an attachment-name title carrying a separator to the path anchors', () => {
    const node = deepest('<div data-message-attachments><span class="PQRcOa_fileCard" title="/tmp/ws/a.txt"><span>a.txt</span></span></div>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('leaves a named card outside every attachment surface alone', () => {
    const node = deepest('<div><div class="somewhere_card" title="a.txt"><span>a.txt</span></div></div>')
    expect(detectTarget(node)).toBeUndefined()
  })
})

describe('reference chip anchors', () => {
  it('claims a rendered @ reference and reads the path out of its token', () => {
    const node = deepest('<p><button type="button" data-ref-chip="file" title="@/tmp/ws/src/a.ts"><span>a.ts</span></button></p>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: '/tmp/ws/src/a.ts', source: 'mention' })
  })

  it('claims a quoted reference token and drops its quotes', () => {
    const node = deepest('<p><button type="button" data-ref-chip="file" title="@&quot;/tmp/ws/a b.txt&quot;"><span>a b.txt</span></button></p>')
    expect(detectTarget(node)).toEqual({ kind: 'file', path: '/tmp/ws/a b.txt', source: 'mention' })
  })

  it('leaves another chip kind to the shell', () => {
    const node = deepest('<p><button type="button" data-ref-chip="session" title="@/tmp/ws/a.ts"><span>a.ts</span></button></p>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('leaves a reference token that is not path-shaped alone', () => {
    const node = deepest('<p><button type="button" data-ref-chip="file" title="@note"><span>note</span></button></p>')
    expect(detectTarget(node)).toBeUndefined()
  })

  it('treats a pasted file reference as an attachment, not as a path', () => {
    const node = deepest('<p><button type="button" data-ref-chip="file" title="@paster-20260916-120514405.txt"><span>paster-20260916-120514405.txt</span></button></p>')
    const target = { kind: 'attachment', name: 'paster-20260916-120514405.txt', source: 'attachment' }
    expect(detectTarget(node)).toEqual(target)
    // The click side claims it too, so a pasted reference previews like a card.
    expect(attachmentTargetOf(node)).toEqual(target)
  })

  it('leaves a workspace reference to the shell on click, and still gives it the menu', () => {
    const node = deepest('<p><button type="button" data-ref-chip="file" title="@src/a.ts"><span>a.ts</span></button></p>')
    expect(attachmentTargetOf(node)).toBeUndefined()
    expect(detectTarget(node)).toEqual({ kind: 'file', path: 'src/a.ts', source: 'mention' })
  })
})

describe('helpers', () => {
  it('accepts only http and https URLs', () => {
    expect(httpUrlOf('https://example.com/x')).toBe('https://example.com/x')
    expect(httpUrlOf('file:///etc/passwd')).toBeUndefined()
    expect(httpUrlOf('javascript:alert(1)')).toBeUndefined()
  })

  it('recognizes path-shaped strings, including names with spaces', () => {
    expect(looksLikePath('/tmp/ws/a.ts')).toBe(true)
    expect(looksLikePath('README.md')).toBe(true)
    // A real macOS bundle name: the space must not disqualify the path.
    expect(looksLikePath('plugins/desktop/dist/DSH Desktop-2.0.9-universal.dmg')).toBe(true)
    expect(looksLikePath('two words.txt')).toBe(true)
    expect(looksLikePath('')).toBe(false)
  })

  it('keeps prose out of the path test', () => {
    expect(looksLikePath('展开更多')).toBe(false)
    expect(looksLikePath('两个 词 而已')).toBe(false)
    expect(looksLikePath('Hello world.')).toBe(false)
  })

  it('reads the path out of a reference token', () => {
    expect(referencePathOf('@src/a.ts')).toBe('src/a.ts')
    expect(referencePathOf('  @/tmp/a b.txt  ')).toBe('/tmp/a b.txt')
    expect(referencePathOf('@"src/a b.ts"')).toBe('src/a b.ts')
    expect(referencePathOf('@')).toBeUndefined()
    expect(referencePathOf('@"unclosed')).toBeUndefined()
    expect(referencePathOf('src/a.ts')).toBeUndefined()
  })

  it('recognizes the paste name convention, and only that', () => {
    expect(isPasteName('paster-20260916-120514405.txt')).toBe(true)
    expect(isPasteName('paster-20260916-120514405-notes.txt')).toBe(true)
    expect(isPasteName('notes.txt')).toBe(false)
    expect(isPasteName('paster-/tmp/a.txt')).toBe(false)
    expect(isPasteName('paster-a b.txt')).toBe(false)
    expect(isPasteName('paster-')).toBe(false)
  })
})
