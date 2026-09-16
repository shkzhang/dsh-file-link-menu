/**
 * Route paths and wire payloads shared by the Host routes and the browser
 * half. Browser-safe: constants and types only.
 */

/** Prefix every route of this plugin answers on. */
export const ROUTE_PREFIX = '/api/dsh-file-link-menu'

/** GET: what this Host can do, so the browser composes only real rows. */
export const CAPS_ROUTE = `${ROUTE_PREFIX}/caps`

/** POST `{ sessionId, path }`: open a Session file with the default application. */
export const OPEN_ROUTE = `${ROUTE_PREFIX}/open`

/** POST `{ sessionId, path }`: select a Session file in the Host file manager. */
export const REVEAL_ROUTE = `${ROUTE_PREFIX}/reveal`

/** POST `{ sessionId, path, app }`: open a Session file with one probed application. */
export const OPEN_WITH_ROUTE = `${ROUTE_PREFIX}/open-with`

/** GET `?sessionId=&path=`: stream a Session file as an attachment. */
export const DOWNLOAD_ROUTE = `${ROUTE_PREFIX}/download`

/** POST `{ url }`: open an external URL in the Host's default browser. */
export const OPEN_URL_ROUTE = `${ROUTE_PREFIX}/open-url`

/** GET `?url=`: stream a remote URL as an attachment. */
export const DOWNLOAD_LINK_ROUTE = `${ROUTE_PREFIX}/download-link`

/** POST `{ name }`: resolve one attached file's display name to its stored path. */
export const ATTACHMENT_ROUTE = `${ROUTE_PREFIX}/attachment`

/** POST `{ sessionId, path, directory }`: copy a Session file into a chosen directory. */
export const SAVE_AS_ROUTE = `${ROUTE_PREFIX}/save-as`

/** POST `{ url, directory }`: write a remote URL into a chosen directory. */
export const SAVE_LINK_AS_ROUTE = `${ROUTE_PREFIX}/save-link-as`

/** JSON bodies are two short strings; anything larger is hostile. */
export const MAX_BODY_BYTES = 64 * 1024

/** Ceiling for one `另存为` response. */
export const MAX_FILE_BYTES = 512 * 1024 * 1024

/** Ceiling for one `链接另存为` response. */
export const MAX_LINK_BYTES = 256 * 1024 * 1024

/** Remote fetches for `链接另存为` give up after this long. */
export const LINK_TIMEOUT_MS = 30_000

/** Redirect hops followed by `链接另存为`, each re-validated. */
export const LINK_REDIRECT_LIMIT = 3

/** Host platform this deployment runs on. */
export type CapsPlatform = 'darwin' | 'win32' | 'linux' | 'other'

/** File-manager flavor reported by the Host, or null when it has none. */
export type CapsFileManager = 'finder' | 'explorer' | 'directory' | null

/** Capability payload the browser composes its menu from. */
export interface CapsPayload {
  readonly platform: CapsPlatform
  readonly fileManager: CapsFileManager
  /** False on a Host with no desktop session; every file row then hides. */
  readonly desktop: boolean
  /** Probe result: application ids this Host can launch, in menu order. */
  readonly apps: readonly string[]
  /** Whether an external URL can be handed to the Host's default browser. */
  readonly openUrl: boolean
  /** Whether the Host can stream a Session file as a download. */
  readonly saveAs: boolean
  /** Whether the Host can fetch a remote URL and stream it as a download. */
  readonly saveLink: boolean
}

/** Launch request shared by open, reveal, and open-with. */
export interface PathRequest {
  readonly sessionId: string
  readonly path: string
  readonly app?: string
}

/** Save request: the source plus the user-chosen destination directory. */
export interface SaveRequest {
  readonly sessionId?: string
  readonly path?: string
  readonly url?: string
  readonly directory: string
}

/** Accepted answer of a save route; `savedPath` names the written file. */
export interface SavedPayload {
  readonly ok: true
  readonly savedPath: string
}

/** URL request for the Host browser hand-off. */
export interface UrlRequest {
  readonly url: string
}

/**
 * Attachment request: the display name one attachment card carries.
 *
 * No Session travels with it: the attachment store is content-addressed and
 * belongs to the Host, not to one Session's workspace, so the name is the
 * whole question. A name matching several stored files answers with the most
 * recently written one.
 */
export interface AttachmentRequest {
  readonly name: string
}

/** Accepted answer of the attachment route. */
export interface AttachmentPayload {
  readonly ok: true
  /** Absolute path of the stored file, inside the Host's attachment store. */
  readonly path: string
  /** Stored byte length. */
  readonly bytes: number
}

/** Uniform success/failure payload of the mutating routes. */
export interface ActionPayload {
  readonly ok: boolean
  /** Stable failure code; the browser maps it to localized copy. */
  readonly error?: string
}
