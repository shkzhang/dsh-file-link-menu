// @vitest-environment node
/**
 * Route behavior: the trust fence, the method guard, the path confinement the
 * file routes inherit, and the refusal of private or unsupported link targets.
 * The launch seam records argv instead of starting an application.
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realpath } from 'node:fs/promises'
import { Readable, Writable } from 'node:stream'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildRoutes, type RouteDefinition } from '../src/routes.ts'
import {
  ATTACHMENT_ROUTE, CAPS_ROUTE, DOWNLOAD_ROUTE, OPEN_ROUTE, OPEN_URL_ROUTE, OPEN_WITH_ROUTE, REVEAL_ROUTE,
  SAVE_AS_ROUTE, SAVE_LINK_AS_ROUTE,
} from '../src/shared.ts'

/** Response sink recording status, headers, and body bytes. */
class FakeResponse extends Writable {
  statusCode = 200
  headersSent = false
  readonly headers = new Map<string, string>()
  readonly chunks: Buffer[] = []

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value)
    return this
  }

  body(): string {
    return Buffer.concat(this.chunks).toString('utf8')
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk))
    callback()
  }
}

/** Request stand-in: an async iterable body plus the HTTP fields the routes read. */
function fakeRequest(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const stream = Readable.from(payload) as unknown as IncomingMessage
  Object.assign(stream, {
    method,
    url,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
  })
  return stream
}

let root = ''
let outside = ''
let argv: (readonly string[])[] = []
let rejections: (401 | 403 | undefined)[] = []
/** Attachments the stub lookup answers with, by name. */
let stored = new Map<string, { path: string; bytes: number }>()

/** Build the routes under test with a recording launch seam and a settable fence. */
function routes(): readonly RouteDefinition[] {
  return buildRoutes({
    connection: { requestRejection: () => rejections.shift() },
    resolveRoot: async () => ({ workspace: root, attachments: attachmentRoot() }),
    resolveAttachment: async name => typeof name === 'string' ? stored.get(name) : undefined,
    warn: () => {},
    launch: (command) => { argv.push(command) },
  })
}

/** The directory standing in for dsh's attachment store. */
function attachmentRoot(): string {
  return join(outside, 'attachments')
}

/** Find one route by path. */
function routeOf(path: string): RouteDefinition {
  const found = routes().find(candidate => candidate.path === path)
  if (found === undefined) throw new Error(`route not registered: ${path}`)
  return found
}

/** Run one request against one route. */
async function call(path: string, method: string, url: string, body?: unknown): Promise<FakeResponse> {
  const response = new FakeResponse()
  await routeOf(path).handler(fakeRequest(method, url, body), response as unknown as ServerResponse)
  return response
}

/** Read the JSON answer of one response. */
function json(response: FakeResponse): Record<string, unknown> {
  return JSON.parse(response.body()) as Record<string, unknown>
}

beforeEach(async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'flm-routes-')))
  root = join(base, 'workspace')
  outside = join(base, 'outside')
  await mkdir(root, { recursive: true })
  await mkdir(join(outside, 'attachments'), { recursive: true })
  await writeFile(join(root, 'README.md'), '# readme\n')
  await writeFile(join(outside, 'secret.txt'), 'secret\n')
  argv = []
  rejections = []
  stored = new Map()
})

describe('trust fence and method guard', () => {
  it('answers the connection rejection before reading anything', async () => {
    rejections = [403]
    const response = await call(CAPS_ROUTE, 'GET', CAPS_ROUTE)
    expect(response.statusCode).toBe(403)
    expect(response.body()).toBe('')
  })

  it('rejects a method the route does not serve', async () => {
    const response = await call(CAPS_ROUTE, 'POST', CAPS_ROUTE)
    expect(response.statusCode).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
  })
})

describe('GET caps', () => {
  it('reports the host platform and launchable applications', async () => {
    const response = await call(CAPS_ROUTE, 'GET', CAPS_ROUTE)
    expect(response.statusCode).toBe(200)
    const payload = json(response)
    expect(['darwin', 'win32', 'linux', 'other']).toContain(payload.platform)
    expect(Array.isArray(payload.apps)).toBe(true)
    expect(payload.saveAs).toBeTypeOf('boolean')
  })
})

describe('POST attachment', () => {
  it('answers the stored path of one attachment name', async () => {
    const path = join(attachmentRoot(), 'paste.txt')
    await writeFile(path, 'pasted\n')
    stored = new Map([['paste.txt', { path, bytes: 7 }]])
    const response = await call(ATTACHMENT_ROUTE, 'POST', ATTACHMENT_ROUTE, { name: 'paste.txt' })
    expect(response.statusCode).toBe(200)
    expect(json(response)).toEqual({ ok: true, path, bytes: 7 })
  })

  it('refuses a name the store does not hold', async () => {
    const response = await call(ATTACHMENT_ROUTE, 'POST', ATTACHMENT_ROUTE, { name: 'gone.txt' })
    expect(response.statusCode).toBe(404)
    expect(json(response).error).toBe('unknown-attachment')
  })

  it('refuses a name that is not one path segment', async () => {
    const response = await call(ATTACHMENT_ROUTE, 'POST', ATTACHMENT_ROUTE, { name: '../../outside/secret.txt' })
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('unknown-attachment')
  })

  it('refuses a body that carries no name', async () => {
    const response = await call(ATTACHMENT_ROUTE, 'POST', ATTACHMENT_ROUTE, {})
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('unknown-attachment')
  })

  it('refuses every name when the composition mounts no attachment store', async () => {
    const route = buildRoutes({
      connection: { requestRejection: () => undefined },
      resolveRoot: async () => ({ workspace: root }),
      warn: () => {},
      launch: () => {},
    }).find(candidate => candidate.path === ATTACHMENT_ROUTE)
    const response = new FakeResponse()
    await route?.handler(fakeRequest('POST', ATTACHMENT_ROUTE, { name: 'a.txt' }), response as unknown as ServerResponse)
    expect(response.statusCode).toBe(409)
    expect(json(response).error).toBe('no-attachment-store')
  })
})

describe('file routes', () => {
  it('opens a workspace file and launches one argv', async () => {
    const response = await call(OPEN_ROUTE, 'POST', OPEN_ROUTE, { sessionId: 's1', path: join(root, 'README.md') })
    expect(response.statusCode).toBe(200)
    expect(argv).toHaveLength(1)
    expect(argv[0]?.at(-1)).toBe(join(root, 'README.md'))
  })

  it('refuses a file outside the Session workspace without launching', async () => {
    const response = await call(OPEN_ROUTE, 'POST', OPEN_ROUTE, { sessionId: 's1', path: join(outside, 'secret.txt') })
    expect(response.statusCode).toBe(403)
    expect(json(response).error).toBe('outside-workspace')
    expect(argv).toHaveLength(0)
  })

  it('reports a missing file', async () => {
    const response = await call(REVEAL_ROUTE, 'POST', REVEAL_ROUTE, { sessionId: 's1', path: join(root, 'gone.md') })
    expect(response.statusCode).toBe(404)
    expect(argv).toHaveLength(0)
  })

  it('acts on a stored attachment the attachment route resolved', async () => {
    const path = join(attachmentRoot(), 'paste.txt')
    await writeFile(path, 'pasted\n')
    stored = new Map([['paste.txt', { path, bytes: 7 }]])
    const resolved = await call(ATTACHMENT_ROUTE, 'POST', ATTACHMENT_ROUTE, { name: 'paste.txt' })
    const response = await call(OPEN_ROUTE, 'POST', OPEN_ROUTE, { sessionId: 's1', path: json(resolved).path })
    expect(response.statusCode).toBe(200)
    expect(argv[0]?.at(-1)).toBe(path)
  })

  it('accepts a JSON body that arrives without a media type', async () => {
    // The connection carrier does not always preserve `content-type`; the
    // bounded parse is what decides, not the header.
    const response = new FakeResponse()
    const request = fakeRequest('POST', OPEN_ROUTE, { sessionId: 's1', path: join(root, 'README.md') })
    delete (request.headers as Record<string, unknown>)['content-type']
    await routeOf(OPEN_ROUTE).handler(request, response as unknown as ServerResponse)
    expect(response.statusCode).toBe(200)
    expect(argv).toHaveLength(1)
  })

  it('rejects a request without a JSON body', async () => {
    const response = new FakeResponse()
    await routeOf(OPEN_ROUTE).handler(fakeRequest('POST', OPEN_ROUTE), response as unknown as ServerResponse)
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('bad-request')
  })

  it('refuses an application the host did not probe', async () => {
    const response = await call(OPEN_WITH_ROUTE, 'POST', OPEN_WITH_ROUTE, {
      sessionId: 's1', path: join(root, 'README.md'), app: 'definitely-not-installed',
    })
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('unknown-app')
    expect(argv).toHaveLength(0)
  })

  it('launches one probed application', async () => {
    const caps = json(await call(CAPS_ROUTE, 'GET', CAPS_ROUTE))
    const apps = caps.apps as string[]
    if (apps.length === 0) return
    const response = await call(OPEN_WITH_ROUTE, 'POST', OPEN_WITH_ROUTE, {
      sessionId: 's1', path: join(root, 'README.md'), app: apps[0],
    })
    expect(response.statusCode).toBe(200)
    expect(argv).toHaveLength(1)
  })

  it('streams a workspace file as an attachment', async () => {
    const url = `${DOWNLOAD_ROUTE}?sessionId=s1&path=${encodeURIComponent('README.md')}`
    const response = await call(DOWNLOAD_ROUTE, 'GET', url)
    expect(response.statusCode).toBe(200)
    expect(response.body()).toBe('# readme\n')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="README.md"; filename*=UTF-8\'\'README.md')
  })

  it('refuses to download a directory', async () => {
    const url = `${DOWNLOAD_ROUTE}?sessionId=s1&path=${encodeURIComponent('.')}`
    const response = await call(DOWNLOAD_ROUTE, 'GET', url)
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('not-a-file')
  })

  it('refuses a download outside the workspace', async () => {
    const url = `${DOWNLOAD_ROUTE}?sessionId=s1&path=${encodeURIComponent(join(outside, 'secret.txt'))}`
    const response = await call(DOWNLOAD_ROUTE, 'GET', url)
    expect(response.statusCode).toBe(403)
    expect(response.body()).not.toContain('secret')
  })
})

describe('save-as routes', () => {
  it('copies a Session file into the chosen directory and names the written path', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'flm-dest-'))
    const response = await call(SAVE_AS_ROUTE, 'POST', SAVE_AS_ROUTE, {
      sessionId: 's1', path: join(root, 'README.md'), directory: destination,
    })
    expect(response.statusCode).toBe(200)
    const saved = json(response).savedPath as string
    // The Host resolves the chosen directory, so the answer carries its real path.
    expect(saved).toBe(join(await realpath(destination), 'README.md'))
    expect(await readFile(saved, 'utf8')).toBe('# readme\n')
  })

  it('never overwrites an existing destination file', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'flm-dest-'))
    await writeFile(join(destination, 'README.md'), 'kept\n')
    const response = await call(SAVE_AS_ROUTE, 'POST', SAVE_AS_ROUTE, {
      sessionId: 's1', path: join(root, 'README.md'), directory: destination,
    })
    expect(json(response).savedPath).toBe(join(await realpath(destination), 'README (1).md'))
    expect(await readFile(join(destination, 'README.md'), 'utf8')).toBe('kept\n')
  })

  it('refuses a destination that is not an existing directory', async () => {
    const response = await call(SAVE_AS_ROUTE, 'POST', SAVE_AS_ROUTE, {
      sessionId: 's1', path: join(root, 'README.md'), directory: join(root, 'gone'),
    })
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('no-directory')
  })

  it('refuses a relative destination', async () => {
    const response = await call(SAVE_AS_ROUTE, 'POST', SAVE_AS_ROUTE, {
      sessionId: 's1', path: join(root, 'README.md'), directory: 'downloads',
    })
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('no-directory')
  })

  it('still confines the source to the Session workspace', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'flm-dest-'))
    const response = await call(SAVE_AS_ROUTE, 'POST', SAVE_AS_ROUTE, {
      sessionId: 's1', path: join(outside, 'secret.txt'), directory: destination,
    })
    expect(response.statusCode).toBe(403)
    const files = await readFile(join(destination, 'secret.txt'), 'utf8').catch(() => 'not written')
    expect(files).toBe('not written')
  })

  it('refuses a private-network link destination', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'flm-dest-'))
    const response = await call(SAVE_LINK_AS_ROUTE, 'POST', SAVE_LINK_AS_ROUTE, {
      url: 'http://10.0.0.5/secret', directory: destination,
    })
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('private-address')
  })
})

describe('link routes', () => {
  it('hands a public URL to the platform browser command', async () => {
    const response = await call(OPEN_URL_ROUTE, 'POST', OPEN_URL_ROUTE, { url: 'https://example.com/a' })
    expect(response.statusCode).toBe(200)
    expect(argv[0]?.at(-1)).toBe('https://example.com/a')
  })

  it('refuses a non-http scheme', async () => {
    const response = await call(OPEN_URL_ROUTE, 'POST', OPEN_URL_ROUTE, { url: 'file:///etc/passwd' })
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('invalid-url')
    expect(argv).toHaveLength(0)
  })

  it('hands a loopback URL to the browser, which is reachability the page already has', async () => {
    const url = 'http://127.0.0.1:43120/?token=abc'
    const response = await call(OPEN_URL_ROUTE, 'POST', OPEN_URL_ROUTE, { url })
    expect(response.statusCode).toBe(200)
    expect(argv[0]?.at(-1)).toBe(url)
  })

  it('hands a named loopback and an intranet host to the browser too', async () => {
    for (const url of ['http://localhost:9090/ui', 'http://192.168.1.10:8080/panel']) {
      argv = []
      const response = await call(OPEN_URL_ROUTE, 'POST', OPEN_URL_ROUTE, { url })
      expect(response.statusCode).toBe(200)
      expect(argv[0]?.at(-1)).toBe(url)
    }
  })

  it('refuses a private destination when the Host itself would fetch it', async () => {
    const url = `${OPEN_URL_ROUTE.replace('open-url', 'download-link')}?url=${encodeURIComponent('http://127.0.0.1:9090/ui')}`
    const response = await call('/api/dsh-file-link-menu/download-link', 'GET', url)
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('private-address')
  })

  it('refuses a private-network destination for link downloads', async () => {
    const url = `${OPEN_URL_ROUTE.replace('open-url', 'download-link')}?url=${encodeURIComponent('http://192.168.1.10/secret')}`
    const response = await call('/api/dsh-file-link-menu/download-link', 'GET', url)
    expect(response.statusCode).toBe(400)
    expect(json(response).error).toBe('private-address')
  })
})
