/**
 * Host routes of dsh-file-link-menu.
 *
 * Every route asks the composition's `connection` service for a rejection
 * first: its Host/Origin fence defeats DNS rebinding and cross-site calls, and
 * its browser authentication gates every caller before any path is resolved.
 * On top of that fence each file route confines the requested path to a root
 * the Host itself names ({@link authorizePath}); the routes that make the Host
 * fetch a remote URL refuse private and loopback destinations before they open
 * a socket, while the route that only hands a URL to the user's own browser
 * does not ({@link checkedRemoteUrl}).
 */
import { createReadStream, createWriteStream } from 'node:fs'
import { access, copyFile, realpath, stat, unlink } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { lookup } from 'node:dns/promises'
import { basename, isAbsolute, join, parse } from 'node:path'
import { spawn } from 'node:child_process'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { authorizePath, type RootResolver } from './authorize.ts'
import { attachmentNameIsSafe, type ResolvedAttachment } from './attachments.ts'
import { appArgv, defaultOpenArgv, desktopAvailable, fileManagerOf, platformOf, probeApps, revealArgv, urlArgv } from './openers.ts'
import {
  ATTACHMENT_ROUTE, CAPS_ROUTE, DOWNLOAD_LINK_ROUTE, DOWNLOAD_ROUTE, LINK_REDIRECT_LIMIT, LINK_TIMEOUT_MS,
  MAX_BODY_BYTES, MAX_FILE_BYTES, MAX_LINK_BYTES, OPEN_ROUTE, OPEN_URL_ROUTE, OPEN_WITH_ROUTE, REVEAL_ROUTE,
  SAVE_AS_ROUTE, SAVE_LINK_AS_ROUTE,
  type ActionPayload, type AttachmentPayload, type CapsPayload, type SavedPayload,
} from './shared.ts'

/** One HTTP route, as `webServer.register` expects it. */
export interface RouteDefinition {
  readonly kind: 'exact'
  readonly path: string
  readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void
}

/** Trust surface consumed here; the browser-side connection package owns the full type. */
interface ConnectionService {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

/** What the routes need from the plugin body. */
export interface RouteDeps {
  readonly connection: ConnectionService
  readonly resolveRoot: RootResolver
  readonly warn: (message: string, error?: unknown) => void
  /**
   * Resolve one attached file's display name to its stored path; undefined when
   * this composition has no host-file-backed attachment store.
   */
  readonly resolveAttachment?: (name: unknown) => Promise<ResolvedAttachment | undefined>
  /** Launch seam; tests supply their own so no spec starts a real application. */
  readonly launch?: (argv: readonly string[]) => void
}

/** Parent directory of a host path, slash- and backslash-aware. */
function parentOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index <= 0 ? path : path.slice(0, index)
}

/** JSON response (no-store: every answer describes live host state). */
function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(payload))
}

/** 405 with the route's one supported method. */
function sendMethodNotAllowed(response: ServerResponse, allow: 'GET' | 'POST'): void {
  response.statusCode = 405
  response.setHeader('allow', allow)
  response.end()
}

/** Uniform failure answer; the code is what the browser localizes. */
function sendFailure(response: ServerResponse, status: number, error: string): void {
  sendJson(response, status, { ok: false, error } satisfies ActionPayload)
}

/**
 * Read a bounded JSON body; undefined when the request is not one.
 *
 * The media type is not required: the browser carrier does not always preserve
 * it through the connection fence, and a valid, size-capped JSON body is the
 * fact this route needs. A body that is not JSON is rejected by the parse.
 */
async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** Launch one argv array detached; the caller never waits for the application. */
function launch(argv: readonly string[], warn: RouteDeps['warn']): void {
  const [command, ...args] = argv
  if (command === undefined) return
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', error => { warn(`launch failed: ${command}`, error) })
  child.unref()
}

/** `Content-Disposition` value carrying both an ASCII and a UTF-8 file name. */
function dispositionFor(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** Whether one address literal belongs to a private, loopback, or link-local range. */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    if (normalized === '::1' || normalized === '::') return true
    if (normalized.startsWith('fe80') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized)
    return mapped?.[1] === undefined ? false : isPrivateAddress(mapped[1])
  }
  const parts = address.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a = 0, b = 0] = parts
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

/** What the Host does with one remote URL: hand it to the browser, or fetch it. */
type UrlUse = 'hand-off' | 'fetch'

/**
 * One validated remote URL, or the refusal code.
 *
 * What must be refused depends on who opens the connection. A `fetch` makes the
 * Host itself connect, so a loopback or private destination is an SSRF
 * primitive: the page would reach services the user never exposed to it, and
 * the answer would come back into the conversation. A `hand-off` only asks the
 * user's own browser to go there, which is reachability the page already has —
 * the menu's adjacent row opens the same address in a new tab with no Host
 * round trip at all. So the private-address refusal belongs to `fetch` alone,
 * and a hand-off keeps just the checks that make the launch safe: an http(s)
 * address of bounded length, handed to the platform command as one argv
 * element, never through a shell.
 * @param raw - URL text from the browser.
 * @param use - what the Host will do with the URL.
 * @returns the parsed URL, or the stable failure code.
 */
async function checkedRemoteUrl(
  raw: unknown,
  use: UrlUse,
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) return { ok: false, error: 'invalid-url' }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: 'invalid-url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'invalid-url' }
  if (use === 'hand-off') return { ok: true, url }
  const host = url.hostname.replace(/^\[|\]$/gu, '')
  if (isIP(host) !== 0) return isPrivateAddress(host) ? { ok: false, error: 'private-address' } : { ok: true, url }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'private-address' }
  }
  try {
    const addresses = await lookup(host, { all: true })
    if (addresses.length === 0 || addresses.some(entry => isPrivateAddress(entry.address))) {
      return { ok: false, error: 'private-address' }
    }
  } catch {
    return { ok: false, error: 'unresolved-host' }
  }
  return { ok: true, url }
}

/** Stream a remote body into the download response, aborting past the cap. */
async function streamRemote(body: ReadableStream<Uint8Array> | null, response: ServerResponse, cap: number): Promise<boolean> {
  if (body === null) {
    response.statusCode = 502
    response.end()
    return false
  }
  let written = 0
  for await (const chunk of Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])) {
    const buffer = chunk as Buffer
    written += buffer.length
    if (written > cap) {
      response.destroy()
      return false
    }
    if (!response.write(buffer)) await new Promise<void>(resolve => { response.once('drain', resolve) })
  }
  response.end()
  return true
}

/** Fetch one remote URL, following redirects only after re-validating each hop. */
async function followRemote(start: URL, signal: AbortSignal): Promise<{ ok: true; response: Response } | { ok: false; error: string }> {
  let current = start
  for (let hop = 0; hop <= LINK_REDIRECT_LIMIT; hop += 1) {
    const checked = await checkedRemoteUrl(current.toString(), 'fetch')
    if (!checked.ok) return checked
    const response = await fetch(checked.url, { redirect: 'manual', signal, headers: { accept: '*/*' } })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (location === null || location.length === 0) return { ok: false, error: 'bad-response' }
      await response.body?.cancel()
      try {
        current = new URL(location, checked.url)
      } catch {
        return { ok: false, error: 'invalid-url' }
      }
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      return { ok: false, error: `remote-${String(response.status)}` }
    }
    return { ok: true, response }
  }
  return { ok: false, error: 'too-many-redirects' }
}

/** A refused save, carrying the status and code the route answers with. */
class SaveRefusal extends Error {
  constructor(readonly status: 400 | 413 | 500 | 502, readonly code: string) {
    super(code)
    this.name = 'SaveRefusal'
  }
}

/** A destination value that is a URL rather than a directory path. */
const SCHEME_LIKE = /^[a-z][a-z\d+.-]*:/iu

/**
 * Resolve the directory a save should land in.
 *
 * The value comes from the Host's own directory chooser, so it is a real path
 * outside the workspace: this route confines the *source*, never the
 * destination. It must still be an existing absolute directory, which keeps a
 * malformed or hostile value from creating files anywhere else.
 * @param value - destination as the browser reported it.
 * @returns the resolved directory, or undefined when it is unusable.
 */
async function safeDirectory(value: unknown): Promise<string | undefined> {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return undefined
  if (SCHEME_LIKE.test(value) || !isAbsolute(value)) return undefined
  try {
    const real = await realpath(value)
    return (await stat(real)).isDirectory() ? real : undefined
  } catch {
    return undefined
  }
}

/**
 * First free name in one directory: `name`, then `name (1)`, `name (2)`…
 * @param directory - resolved destination directory.
 * @param name - preferred file name.
 * @returns a path that does not exist yet.
 */
async function uniqueDestination(directory: string, name: string): Promise<string> {
  const { name: stem, ext } = parse(name)
  for (let index = 0; index < 1000; index += 1) {
    const candidate = join(directory, index === 0 ? name : `${stem} (${String(index)})${ext}`)
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
  throw new SaveRefusal(500, 'save-failed')
}

/** Copy one authorized file into a directory, refusing an oversized file. */
async function copyInto(directory: string, source: string, name: string, cap: number): Promise<string> {
  if ((await stat(source)).size > cap) throw new SaveRefusal(413, 'too-large')
  const destination = await uniqueDestination(directory, name)
  await copyFile(source, destination)
  return destination
}

/** Write one remote body to a file, removing a partial file on failure. */
async function writeRemote(body: ReadableStream<Uint8Array> | null, destination: string, cap: number): Promise<void> {
  if (body === null) throw new SaveRefusal(502, 'bad-response')
  const sink = createWriteStream(destination)
  let written = 0
  try {
    for await (const chunk of Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])) {
      const buffer = chunk as Buffer
      written += buffer.length
      if (written > cap) throw new SaveRefusal(413, 'too-large')
      if (!sink.write(buffer)) await new Promise<void>(resolve => { sink.once('drain', resolve) })
    }
    await new Promise<void>((resolve, reject) => {
      sink.end(() => { resolve() })
      sink.once('error', reject)
    })
  } catch (error: unknown) {
    sink.destroy()
    await unlink(destination).catch(() => undefined)
    throw error
  }
}

/**
 * Build every route this plugin serves.
 * @param deps - trust fence, Session root lookup, attachment lookup, and the host logger.
 * @returns route definitions in registration order.
 */
export function buildRoutes(deps: RouteDeps): readonly RouteDefinition[] {
  const { connection, resolveRoot, resolveAttachment, warn } = deps
  const run = deps.launch ?? ((argv: readonly string[]): void => { launch(argv, warn) })
  const platform = platformOf()

  /** Answer an untrusted or unauthenticated request; true when it was rejected. */
  const rejected = (request: IncomingMessage, response: ServerResponse): boolean => {
    const rejection = connection.requestRejection(request)
    if (rejection === undefined) return false
    response.statusCode = rejection
    response.end()
    return true
  }

  /** Authorize one requested path, answering the refusal itself when it fails. */
  const resolved = async (
    response: ServerResponse, sessionId: unknown, path: unknown,
  ): Promise<{ path: string; isDirectory: boolean; size: number } | undefined> => {
    // The lookup runs even without a Session: an attachment belongs to none, so
    // the resolver answers the attachment store root either way, while the
    // workspace half stays unresolved and refuses every workspace path.
    const roots = await resolveRoot(typeof sessionId === 'string' ? sessionId : '')
    const decision = await authorizePath(roots, path)
    if (!decision.ok) {
      sendFailure(response, decision.refusal.status, decision.refusal.error)
      return undefined
    }
    return decision.value
  }

  /** Answer a thrown handler with JSON and the real error on the host log. */
  const guarded = (
    inner: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  ) => async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      await inner(request, response)
    } catch (error: unknown) {
      console.error('[dsh-file-link-menu] route failed', error)
      warn('route failed', error)
      if (response.headersSent) response.destroy()
      else sendFailure(response, 500, 'internal')
    }
  }

  return [
    {
      kind: 'exact',
      path: CAPS_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'GET') { sendMethodNotAllowed(response, 'GET'); return }
        const fileManager = await fileManagerOf(platform)
        const desktop = await desktopAvailable(platform, fileManager)
        const payload: CapsPayload = {
          platform,
          fileManager,
          desktop,
          apps: desktop ? await probeApps(platform) : [],
          openUrl: urlArgv('https://example.invalid/', platform) !== undefined,
          saveAs: desktop,
          saveLink: platform !== 'other',
        }
        sendJson(response, 200, payload)
      }),
    },
    {
      kind: 'exact',
      path: ATTACHMENT_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'POST') { sendMethodNotAllowed(response, 'POST'); return }
        const body = await readJsonBody(request)
        if (body === undefined) { sendFailure(response, 400, 'bad-request'); return }
        if (resolveAttachment === undefined) { sendFailure(response, 409, 'no-attachment-store'); return }
        if (!attachmentNameIsSafe(body.name)) { sendFailure(response, 400, 'unknown-attachment'); return }
        const found = await resolveAttachment(body.name)
        if (found === undefined) { sendFailure(response, 404, 'unknown-attachment'); return }
        sendJson(response, 200, { ok: true, path: found.path, bytes: found.bytes } satisfies AttachmentPayload)
      }),
    },
    {
      kind: 'exact',
      path: OPEN_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'POST') { sendMethodNotAllowed(response, 'POST'); return }
        const body = await readJsonBody(request)
        if (body === undefined) { sendFailure(response, 400, 'bad-request'); return }
        const target = await resolved(response, body.sessionId, body.path)
        if (target === undefined) return
        const argv = defaultOpenArgv(target.path, platform)
        if (argv === undefined) { sendFailure(response, 501, 'unsupported-platform'); return }
        run(argv)
        sendJson(response, 200, { ok: true } satisfies ActionPayload)
      }),
    },
    {
      kind: 'exact',
      path: REVEAL_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'POST') { sendMethodNotAllowed(response, 'POST'); return }
        const body = await readJsonBody(request)
        if (body === undefined) { sendFailure(response, 400, 'bad-request'); return }
        const target = await resolved(response, body.sessionId, body.path)
        if (target === undefined) return
        const argv = revealArgv(target.path, target.isDirectory, platform)
        if (argv === undefined) { sendFailure(response, 501, 'unsupported-platform'); return }
        run(argv)
        sendJson(response, 200, { ok: true } satisfies ActionPayload)
      }),
    },
    {
      kind: 'exact',
      path: OPEN_WITH_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'POST') { sendMethodNotAllowed(response, 'POST'); return }
        const body = await readJsonBody(request)
        if (body === undefined) { sendFailure(response, 400, 'bad-request'); return }
        const target = await resolved(response, body.sessionId, body.path)
        if (target === undefined) return
        const appId = body.app
        if (typeof appId !== 'string') { sendFailure(response, 400, 'unknown-app'); return }
        const available = await probeApps(platform)
        if (!available.includes(appId)) { sendFailure(response, 400, 'unknown-app'); return }
        const argv = appArgv(appId, target.path, target.isDirectory, platform)
        if (argv === undefined) { sendFailure(response, 400, 'unknown-app'); return }
        run(argv)
        sendJson(response, 200, { ok: true } satisfies ActionPayload)
      }),
    },
    {
      kind: 'exact',
      path: DOWNLOAD_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'GET') { sendMethodNotAllowed(response, 'GET'); return }
        const query = new URL(request.url ?? '/', 'http://localhost').searchParams
        const target = await resolved(response, query.get('sessionId'), query.get('path'))
        if (target === undefined) return
        if (target.isDirectory) { sendFailure(response, 400, 'not-a-file'); return }
        if (target.size > MAX_FILE_BYTES) { sendFailure(response, 413, 'too-large'); return }
        response.statusCode = 200
        response.setHeader('content-type', 'application/octet-stream')
        response.setHeader('content-length', String(target.size))
        response.setHeader('content-disposition', dispositionFor(basename(target.path)))
        response.setHeader('cache-control', 'no-store')
        await pipeline(createReadStream(target.path), response)
      }),
    },
    {
      kind: 'exact',
      path: OPEN_URL_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'POST') { sendMethodNotAllowed(response, 'POST'); return }
        const body = await readJsonBody(request)
        if (body === undefined) { sendFailure(response, 400, 'bad-request'); return }
        const checked = await checkedRemoteUrl(body.url, 'hand-off')
        if (!checked.ok) { sendFailure(response, 400, checked.error); return }
        const argv = urlArgv(checked.url.toString(), platform)
        if (argv === undefined) { sendFailure(response, 501, 'unsupported-platform'); return }
        run(argv)
        sendJson(response, 200, { ok: true } satisfies ActionPayload)
      }),
    },
    {
      kind: 'exact',
      path: DOWNLOAD_LINK_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'GET') { sendMethodNotAllowed(response, 'GET'); return }
        const query = new URL(request.url ?? '/', 'http://localhost').searchParams
        const checked = await checkedRemoteUrl(query.get('url'), 'fetch')
        if (!checked.ok) { sendFailure(response, 400, checked.error); return }
        const controller = new AbortController()
        const timer = setTimeout(() => { controller.abort() }, LINK_TIMEOUT_MS)
        try {
          const remote = await followRemote(checked.url, controller.signal)
          if (!remote.ok) { sendFailure(response, 502, remote.error); return }
          const declared = Number(remote.response.headers.get('content-length') ?? '0')
          if (Number.isFinite(declared) && declared > MAX_LINK_BYTES) {
            await remote.response.body?.cancel()
            sendFailure(response, 413, 'too-large')
            return
          }
          const name = basename(new URL(remote.response.url === '' ? checked.url.toString() : remote.response.url).pathname) || 'download'
          response.statusCode = 200
          response.setHeader('content-type', remote.response.headers.get('content-type') ?? 'application/octet-stream')
          response.setHeader('content-disposition', dispositionFor(name))
          response.setHeader('cache-control', 'no-store')
          await streamRemote(remote.response.body, response, MAX_LINK_BYTES)
        } catch (error: unknown) {
          warn('save link failed', error)
          if (!response.headersSent) sendFailure(response, 502, 'fetch-failed')
          else response.destroy()
        } finally {
          clearTimeout(timer)
        }
      }),
    },
    {
      kind: 'exact',
      path: SAVE_AS_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'POST') { sendMethodNotAllowed(response, 'POST'); return }
        const body = await readJsonBody(request)
        if (body === undefined) { sendFailure(response, 400, 'bad-request'); return }
        const target = await resolved(response, body.sessionId, body.path)
        if (target === undefined) return
        if (target.isDirectory) { sendFailure(response, 400, 'not-a-file'); return }
        const directory = await safeDirectory(body.directory)
        if (directory === undefined) { sendFailure(response, 400, 'no-directory'); return }
        try {
          const savedPath = await copyInto(directory, target.path, basename(target.path), MAX_FILE_BYTES)
          sendJson(response, 200, { ok: true, savedPath } satisfies SavedPayload)
        } catch (error: unknown) {
          const refusal = error instanceof SaveRefusal ? error : new SaveRefusal(500, 'save-failed')
          warn(`save-as refused: ${refusal.code}`, error)
          sendFailure(response, refusal.status, refusal.code)
        }
      }),
    },
    {
      kind: 'exact',
      path: SAVE_LINK_AS_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return
        if (request.method !== 'POST') { sendMethodNotAllowed(response, 'POST'); return }
        const body = await readJsonBody(request)
        if (body === undefined) { sendFailure(response, 400, 'bad-request'); return }
        const directory = await safeDirectory(body.directory)
        if (directory === undefined) { sendFailure(response, 400, 'no-directory'); return }
        const checked = await checkedRemoteUrl(body.url, 'fetch')
        if (!checked.ok) { sendFailure(response, 400, checked.error); return }
        const controller = new AbortController()
        const timer = setTimeout(() => { controller.abort() }, LINK_TIMEOUT_MS)
        try {
          const remote = await followRemote(checked.url, controller.signal)
          if (!remote.ok) { sendFailure(response, 502, remote.error); return }
          const declared = Number(remote.response.headers.get('content-length') ?? '0')
          if (Number.isFinite(declared) && declared > MAX_LINK_BYTES) {
            await remote.response.body?.cancel()
            sendFailure(response, 413, 'too-large')
            return
          }
          const address = new URL(remote.response.url === '' ? checked.url.toString() : remote.response.url)
          const name = basename(address.pathname) || 'download'
          const destination = await uniqueDestination(directory, name)
          await writeRemote(remote.response.body, destination, MAX_LINK_BYTES)
          sendJson(response, 200, { ok: true, savedPath: destination } satisfies SavedPayload)
        } catch (error: unknown) {
          const refusal = error instanceof SaveRefusal ? error : new SaveRefusal(502, 'fetch-failed')
          warn(`save-link-as refused: ${refusal.code}`, error)
          sendFailure(response, refusal.status, refusal.code)
        } finally {
          clearTimeout(timer)
        }
      }),
    },
  ]
}

export { parentOf }
