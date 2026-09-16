/**
 * Host half of dsh-file-link-menu.
 *
 * It owns the file and link actions the browser menu triggers: launch the
 * default application, select a file in the Host file manager, launch one
 * probed application, stream a Session file as an attachment, hand a URL to
 * the default browser, and stream a remote URL as an attachment. It also turns
 * an attached file's display name back into the stored path its card cannot
 * carry. The browser never sees a Host path it can act on without this half
 * verifying it first.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AdmittedRoots } from './authorize.ts'
import {
  attachmentStoreRoot, createAttachmentLookup, type AttachmentStoreService,
} from './attachments.ts'
import { buildRoutes, type RouteDefinition } from './routes.ts'

/** Cordis function-plugin name. */
export const name = 'dsh-file-link-menu'

/** The route carrier and the trust fence guarding every route. */
export const inject = ['webServer', 'connection']

/** Trust surface consumed here; the browser-side connection package owns the full type. */
interface ConnectionService {
  requestRejection(request: { readonly headers: import('node:http').IncomingMessage['headers'] }): 401 | 403 | undefined
}

/** The composition's HTTP carrier. */
interface WebServerService {
  register(route: RouteDefinition): () => void
}

/** Session lookup narrowed to the workspace root this plugin needs. */
interface SessionQueryService {
  readSession(sessionId: string): Promise<{ session?: { cwd?: string | null } | undefined } | undefined>
}

/** Sandbox fallback for a Session whose own workspace root is unknown. */
interface SandboxPolicyService {
  readonly workspaceRoot?: string
}

/**
 * One Host service, or undefined when this composition does not provide it.
 *
 * `ctx.get` is the lookup for services this plugin does not declare: the
 * context property proxy throws for an undeclared name, which would turn every
 * route that needs an optional service into an unhandled handler failure.
 * @param ctx - host root context.
 * @param key - service name.
 * @returns the service object, or undefined when absent.
 */
function serviceOf<T>(ctx: Context, key: string): T | undefined {
  const reader = (ctx as { get?: (name: string) => unknown }).get
  if (typeof reader === 'function') {
    const value = reader.call(ctx, key)
    return typeof value === 'object' && value !== null ? value as T : undefined
  }
  return undefined
}

/**
 * Resolve one Session's workspace root.
 *
 * The Session's own `cwd` wins; a composition without the Session query
 * service falls back to the sandbox workspace root, which is the same boundary
 * the file tools enforce. An unresolved workspace stays unresolved, which
 * refuses every relative path rather than resolving it somewhere else.
 * @param ctx - host root context.
 * @param sessionId - Session the browser reported.
 * @returns the absolute workspace root, or undefined when it cannot be resolved.
 */
async function resolveWorkspace(ctx: Context, sessionId: string): Promise<string | undefined> {
  // No Session is named, so no workspace can be resolved for one; the
  // deployment fallback below answers for a named Session whose cwd is unknown.
  if (sessionId.length === 0) return undefined
  const query = serviceOf<SessionQueryService>(ctx, 'sessionQuery')
  if (query !== undefined) {
    try {
      const snapshot = await query.readSession(sessionId)
      const cwd = snapshot?.session?.cwd
      if (typeof cwd === 'string' && cwd.length > 0) return cwd
    } catch (error: unknown) {
      ctx.logger?.warn?.('dsh-file-link-menu: session lookup failed', error)
    }
  }
  const policy = serviceOf<SandboxPolicyService>(ctx, 'sandboxPolicy')
  const root = policy?.workspaceRoot
  return typeof root === 'string' && root.length > 0 ? root : undefined
}

/**
 * Resolve the roots one Session may act on.
 * @param ctx - host root context.
 * @param sessionId - Session the browser reported.
 * @param storeRoot - the attachment store root, when this backend has one.
 * @returns the workspace and attachment roots this Session may act on.
 */
async function resolveRoots(ctx: Context, sessionId: string, storeRoot: string | undefined): Promise<AdmittedRoots> {
  const workspace = await resolveWorkspace(ctx, sessionId)
  return {
    ...(workspace === undefined ? {} : { workspace }),
    ...(storeRoot === undefined ? {} : { attachments: storeRoot }),
  }
}

/**
 * Plugin body: register every route on the composition's web server.
 * @param ctx - host root context carrying `webServer` and `connection`.
 */
export function apply(ctx: Context): void {
  const connection = serviceOf<ConnectionService>(ctx, 'connection')
  const webServer = serviceOf<WebServerService>(ctx, 'webServer')
  if (connection === undefined || webServer === undefined) {
    ctx.logger?.warn?.('dsh-file-link-menu: webServer or connection unavailable; no routes registered')
    return
  }
  const store = serviceOf<AttachmentStoreService>(ctx, 'attachments')
  const storeRoot = attachmentStoreRoot(store)
  const lookup = createAttachmentLookup({
    store,
    warn: (message, error) => { ctx.logger?.warn?.(`dsh-file-link-menu: ${message}`, error) },
  })
  const routes = buildRoutes({
    connection,
    resolveRoot: sessionId => resolveRoots(ctx, sessionId, storeRoot),
    resolveAttachment: lookup,
    warn: (message, error) => { ctx.logger?.warn?.(`dsh-file-link-menu: ${message}`, error) },
  })
  for (const route of routes) {
    ctx.effect(() => webServer.register(route), `dsh-file-link-menu: ${route.path}`)
  }
  ctx.logger?.info?.(
    storeRoot === undefined
      ? 'dsh-file-link-menu: host routes ready — workspace files only (no attachment store on this composition)'
      : `dsh-file-link-menu: host routes ready — workspace files and attachments (${storeRoot})`,
  )
}
