// @vitest-environment jsdom
/**
 * Download plumbing. The Host answers an attachment with
 * `Content-Disposition`, and the browser must be the thing that follows it:
 * the app page itself never navigates, so a refused download cannot take the
 * conversation view down with it.
 */
import { describe, expect, it, vi } from 'vitest'
import { FileLinkMenuController } from '../src/client/controller.ts'

describe('FileLinkMenuController downloads', () => {
  it('downloads a Session file through a hidden frame', () => {
    const controller = new FileLinkMenuController()
    controller.download('session-1', '/ws/a b.ts')
    const frame = document.querySelector('iframe[data-dsh-file-link-menu-download]')
    expect(frame).not.toBeNull()
    expect(frame?.getAttribute('src')).toContain('/api/dsh-file-link-menu/download?sessionId=session-1&path=%2Fws%2Fa%20b.ts')
    // An anchor would navigate the page when the answer is not an attachment.
    expect(document.querySelector('a[href*="/api/dsh-file-link-menu/download"]')).toBeNull()
    frame?.remove()
  })

  it('posts the chosen directory for a file save and returns the written path', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, savedPath: '/dest/a.ts' }))
    vi.stubGlobal('fetch', fetcher)
    try {
      const controller = new FileLinkMenuController()
      await expect(controller.saveAs('s1', '/ws/a.ts', '/dest')).resolves.toBe('/dest/a.ts')
      const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
      expect(String(url)).toContain('/api/dsh-file-link-menu/save-as')
      expect(init.method).toBe('POST')
      expect(JSON.parse(String(init.body))).toEqual({ sessionId: 's1', path: '/ws/a.ts', directory: '/dest' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports a save the Host refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: 'no-directory' }, { status: 400 })))
    try {
      const controller = new FileLinkMenuController()
      await expect(controller.saveLinkAs('https://example.com/a.pdf', '/nope')).rejects.toThrow('no-directory')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('downloads a link through a hidden frame', () => {
    const controller = new FileLinkMenuController()
    controller.downloadLink('https://example.com/report.pdf')
    const frame = document.querySelector('iframe[data-dsh-file-link-menu-download]')
    expect(frame?.getAttribute('src')).toContain('/api/dsh-file-link-menu/download-link?url=https%3A%2F%2Fexample.com%2Freport.pdf')
    frame?.remove()
  })
})

describe('FileLinkMenuController attachments', () => {
  it('posts the display name and answers the path the Host stored it at', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, path: '/home/.dsh/attachments/v1/files/aa/aaaa/paste.txt', bytes: 7 }))
    vi.stubGlobal('fetch', fetcher)
    try {
      const controller = new FileLinkMenuController()
      await expect(controller.attachmentPath('paste.txt')).resolves.toEqual({
        path: '/home/.dsh/attachments/v1/files/aa/aaaa/paste.txt',
        bytes: 7,
      })
      const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
      expect(String(url)).toContain('/api/dsh-file-link-menu/attachment')
      expect(init.method).toBe('POST')
      expect(JSON.parse(String(init.body))).toEqual({ name: 'paste.txt' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports an attachment the Host could not resolve', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: 'unknown-attachment' }, { status: 404 })))
    try {
      const controller = new FileLinkMenuController()
      await expect(controller.attachmentPath('gone.txt')).rejects.toThrow('unknown-attachment')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refuses an answer that carries no path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })))
    try {
      const controller = new FileLinkMenuController()
      await expect(controller.attachmentPath('paste.txt')).rejects.toThrow('unknown-attachment')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
