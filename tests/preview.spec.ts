// @vitest-environment jsdom
/**
 * Right-Sidebar preview. These cases pin the address the Sidebar's file type
 * reads, and the type this plugin names: a composition may register a
 * workspace-fenced editor for the same address, and that editor must not claim
 * an attachment the workspace does not contain.
 */
import { describe, expect, it, vi } from 'vitest'
import { previewFileInSidebar, sessionFileAddress } from '../src/client/preview.ts'

describe('sessionFileAddress', () => {
  it('names the Session and keeps an absolute path absolute', () => {
    expect(sessionFileAddress('s-1', '/home/me/notes.txt'))
      .toBe('dsh-resource://file/session/s-1//home/me/notes.txt')
  })

  it('encodes a name carrying a space, a hash, or a question mark', () => {
    expect(sessionFileAddress('s-1', '/tmp/a b#c?.txt'))
      .toBe('dsh-resource://file/session/s-1//tmp/a%20b%23c%3F.txt')
  })

  it('normalizes a Windows spelling and keeps its drive letter literal', () => {
    expect(sessionFileAddress('s-1', 'C:\\ws\\a.ts')).toBe('dsh-resource://file/session/s-1/C:/ws/a.ts')
  })
})

describe('previewFileInSidebar', () => {
  it('opens the file as the shell text tab', () => {
    const openResource = vi.fn()
    previewFileInSidebar({ openResource }, 's-1', '/home/me/notes.txt')
    expect(openResource).toHaveBeenCalledWith(
      'dsh-resource://file/session/s-1//home/me/notes.txt',
      { kind: 'text' },
    )
  })

  it('lets a Sidebar that refuses the address throw, so the caller can fall back', () => {
    const openResource = vi.fn(() => { throw new Error('no such kind') })
    expect(() => { previewFileInSidebar({ openResource }, 's-1', '/a.txt') }).toThrow('no such kind')
  })
})
