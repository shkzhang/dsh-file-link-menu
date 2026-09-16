/**
 * Browser side of the menu actions: Host capability read, the file and link
 * routes, and the two pure-browser actions (`复制文件路径` / `复制链接` and the
 * new-tab hand-off) that need no Host round trip.
 */
import {
  ATTACHMENT_ROUTE, CAPS_ROUTE, DOWNLOAD_LINK_ROUTE, DOWNLOAD_ROUTE, OPEN_ROUTE, OPEN_URL_ROUTE, OPEN_WITH_ROUTE,
  REVEAL_ROUTE, SAVE_AS_ROUTE, SAVE_LINK_AS_ROUTE,
  type ActionPayload, type AttachmentRequest, type CapsPayload,
} from '../shared.ts'

/** One action failure carrying the Host's stable code. */
export class MenuActionError extends Error {
  /**
   * @param code - stable failure code from the Host, or a browser-side code.
   */
  constructor(readonly code: string) {
    super(code)
    this.name = 'MenuActionError'
  }
}

/** Same-origin base, with the null-origin fallback the shell's carrier uses. */
function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== '' && origin !== 'null' ? origin : 'http://dsh.internal'
}

/** Plugin-owned action surface for the menu component. */
export class FileLinkMenuController {
  private caps: CapsPayload | null = null
  private loading: Promise<CapsPayload | null> | undefined

  /** Capabilities already read, for the first render after a page cache. */
  get known(): CapsPayload | null {
    return this.caps
  }

  /** Read Host capabilities once per page; a failed read hides every Host row. */
  loadCaps(): Promise<CapsPayload | null> {
    this.loading ??= this.readCaps()
    return this.loading
  }

  private async readCaps(): Promise<CapsPayload | null> {
    try {
      const response = await fetch(new URL(CAPS_ROUTE, hostBase()), { headers: { accept: 'application/json' } })
      if (!response.ok) return null
      const payload = await response.json() as CapsPayload
      this.caps = {
        platform: payload.platform,
        fileManager: payload.fileManager ?? null,
        desktop: payload.desktop === true,
        apps: Array.isArray(payload.apps) ? payload.apps.filter(id => typeof id === 'string') : [],
        openUrl: payload.openUrl === true,
        saveAs: payload.saveAs === true,
        saveLink: payload.saveLink === true,
      }
      return this.caps
    } catch {
      return null
    }
  }

  /** Open one Session file with the default application. */
  async open(sessionId: string, path: string): Promise<void> {
    await this.mutate(OPEN_ROUTE, { sessionId, path })
  }

  /**
   * Resolve one attached file's display name to the path the Host stored it at.
   *
   * An attachment card carries the name only, so every action that needs a path
   * starts here; the answer's path is inside the Host's attachment store, which
   * the Host's own routes admit as a second root.
   * @param name - display name the attachment card carried.
   * @returns the stored path and byte length.
   */
  async attachmentPath(name: string): Promise<{ path: string; bytes: number }> {
    const payload = await this.mutate(ATTACHMENT_ROUTE, { name } satisfies AttachmentRequest)
    const { path, bytes } = payload as { path?: unknown; bytes?: unknown }
    if (typeof path !== 'string' || path.length === 0) throw new MenuActionError('unknown-attachment')
    return { path, bytes: typeof bytes === 'number' ? bytes : 0 }
  }

  /** Select one Session file in the Host file manager. */
  async reveal(sessionId: string, path: string): Promise<void> {
    await this.mutate(REVEAL_ROUTE, { sessionId, path })
  }

  /** Open one Session file with one probed application. */
  async openWith(sessionId: string, path: string, app: string): Promise<void> {
    await this.mutate(OPEN_WITH_ROUTE, { sessionId, path, app })
  }

  /** Hand one external URL to the Host's default browser. */
  async openUrl(url: string): Promise<void> {
    await this.mutate(OPEN_URL_ROUTE, { url })
  }

  /**
   * Copy one Session file into a directory the user chose.
   * @param sessionId - Session that declared the file.
   * @param path - path as the menu read it off the DOM.
   * @param directory - absolute destination directory from the Host picker.
   * @returns the path the Host wrote.
   */
  async saveAs(sessionId: string, path: string, directory: string): Promise<string> {
    return await this.savedPath(await this.mutate(SAVE_AS_ROUTE, { sessionId, path, directory }))
  }

  /**
   * Write one remote URL into a directory the user chose.
   * @param url - validated http(s) URL.
   * @param directory - absolute destination directory from the Host picker.
   * @returns the path the Host wrote.
   */
  async saveLinkAs(url: string, directory: string): Promise<string> {
    return await this.savedPath(await this.mutate(SAVE_LINK_AS_ROUTE, { url, directory }))
  }

  /** Read the written path out of one save answer. */
  private savedPath(payload: ActionPayload): string {
    const saved = (payload as { savedPath?: unknown }).savedPath
    if (typeof saved !== 'string' || saved.length === 0) throw new MenuActionError('save-failed')
    return saved
  }

  /** Start a browser download of one Session file. */
  download(sessionId: string, path: string): void {
    this.triggerDownload(new URL(`${DOWNLOAD_ROUTE}?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`, hostBase()))
  }

  /** Start a browser download of one remote URL. */
  downloadLink(url: string): void {
    this.triggerDownload(new URL(`${DOWNLOAD_LINK_ROUTE}?url=${encodeURIComponent(url)}`, hostBase()))
  }

  /** Copy one string to the clipboard, with a selection fallback for insecure origins. */
  async copyText(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {
      // Fall through to the selection path: an origin without clipboard
      // permission still accepts an explicit copy command.
    }
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', 'readonly')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.append(area)
    try {
      area.select()
      if (!document.execCommand('copy')) throw new MenuActionError('copy-failed')
    } catch {
      throw new MenuActionError('copy-failed')
    } finally {
      area.remove()
    }
  }

  private async mutate(route: string, body: unknown): Promise<ActionPayload> {
    let response: Response
    try {
      response = await fetch(new URL(route, hostBase()), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new MenuActionError('network')
    }
    let payload: ActionPayload = { ok: response.ok }
    try {
      payload = await response.json() as ActionPayload
    } catch {
      // A non-JSON answer keeps the status-derived default above.
    }
    if (!response.ok || payload.ok !== true) throw new MenuActionError(payload.error ?? `http-${String(response.status)}`)
    return payload
  }

  /**
   * Start one attachment download without navigating the app away.
   *
   * A direct anchor or location change makes the browser leave the Harness
   * page whenever the Host answers with anything but an attachment (a refusal,
   * for instance), which loses the whole conversation view. A hidden frame
   * takes that navigation instead, so a failed download is invisible here and
   * the Host's `Content-Disposition` still drives the shell's own save flow.
   */
  private triggerDownload(url: URL): void {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('data-dsh-file-link-menu-download', '')
    frame.style.display = 'none'
    frame.src = url.toString()
    document.body.append(frame)
    setTimeout(() => { frame.remove() }, 60_000)
  }
}
