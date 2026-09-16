/**
 * Session file authorization.
 *
 * The browser sends a path it read off the DOM, so the Host never trusts it:
 * the path is resolved against the Session's workspace root and must land
 * inside one of the roots the Host itself names after symlinks are followed. A
 * path outside every root is refused, which keeps the menu from becoming an
 * arbitrary-file-open (or arbitrary-file-read, through the download route)
 * primitive.
 *
 * A Session has two admissible roots: its workspace, and dsh's attachment
 * store. Text pasted into the composer is stored as an attachment — a
 * content-addressed file below `DSH_HOME`, outside every workspace — and the
 * file card the composer draws for it carries only the file name, so the store
 * is the only place that name can be turned back into a path. The second root
 * admits nothing but files the store itself wrote: the browser learns an
 * attachment path only from the Host's own `attachment` route, and every path
 * that route returns is inside the store.
 */
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The roots one Session may act on, answered by the Host's Session services.
 *
 * Both are optional because neither is guaranteed: a Session may have no
 * workspace, and a composition may mount no host-file-backed attachment store.
 * A resolved path must land inside one of them.
 */
export interface AdmittedRoots {
  /**
   * Session workspace root. Relative paths resolve against it and only it, so
   * an unknown workspace refuses a relative path rather than resolving it
   * against the attachment store.
   */
  readonly workspace?: string
  /** dsh's attachment store root, which sits outside every workspace. */
  readonly attachments?: string
}

/** Root lookup for one Session, answered by the Host's Session services. */
export type RootResolver = (sessionId: string) => Promise<AdmittedRoots>

/** A path the Host accepted, already resolved through symlinks. */
export interface AuthorizedPath {
  readonly path: string
  readonly isDirectory: boolean
  readonly size: number
}

/** Why a requested path was refused; the status is the route's answer. */
export interface PathRefusal {
  readonly status: 400 | 403 | 404 | 409
  readonly error: string
}

/** Either the accepted path or the refusal the route must return. */
export type PathDecision = { readonly ok: true; readonly value: AuthorizedPath } | { readonly ok: false; readonly refusal: PathRefusal }

/** A path that could name a remote resource or a protocol URL never reaches the opener. */
const URL_LIKE = /^[a-z][a-z\d+.-]*:/iu

/**
 * Convert one `file:` address to its Host path.
 * @param value - address starting with `file:`.
 * @returns the decoded path, or undefined when the address is malformed.
 */
function localPathOf(value: string): string | undefined {
  try {
    return fileURLToPath(value)
  } catch {
    return undefined
  }
}

/**
 * Canonical form of one admitted root.
 * @param root - absolute root, or undefined when this Host has none.
 * @returns the root resolved through symlinks, or undefined when it admits nothing.
 */
async function realRoot(root: string | undefined): Promise<string | undefined> {
  if (root === undefined || root.length === 0) return undefined
  try {
    return await realpath(root)
  } catch {
    // A root that cannot be resolved admits nothing.
    return undefined
  }
}

/**
 * Resolve and confine one requested path.
 * @param roots - the roots this Host admits for the Session; none when neither is known.
 * @param rawPath - path exactly as the browser sent it.
 * @returns the resolved file facts, or the refusal to answer with.
 */
export async function authorizePath(roots: AdmittedRoots | undefined, rawPath: unknown): Promise<PathDecision> {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.includes('\0')) {
    return { ok: false, refusal: { status: 400, error: 'invalid-path' } }
  }
  // A surface may hand over a `file:` address instead of a plain path; that is
  // still a local file, so translate it rather than refusing it. Every other
  // scheme (a remote URL, a resource address) is not a Host path.
  const requested = rawPath.startsWith('file:') ? localPathOf(rawPath) : rawPath
  if (requested === undefined || URL_LIKE.test(requested)) {
    return { ok: false, refusal: { status: 400, error: 'invalid-path' } }
  }

  const workspace = await realRoot(roots?.workspace)
  const admitted = [workspace, await realRoot(roots?.attachments)]
    .filter((root): root is string => root !== undefined)
  if (admitted.length === 0) return { ok: false, refusal: { status: 409, error: 'no-workspace' } }

  // Relative paths are workspace-relative; only an absolute path can name an
  // attachment, because the store is not a place a Session writes into.
  const candidate = isAbsolute(requested)
    ? requested
    : workspace === undefined ? undefined : resolve(workspace, requested)
  if (candidate === undefined) return { ok: false, refusal: { status: 409, error: 'no-workspace' } }

  let real: string
  let info: Awaited<ReturnType<typeof stat>>
  try {
    real = await realpath(candidate)
    info = await stat(real)
  } catch {
    return { ok: false, refusal: { status: 404, error: 'missing' } }
  }

  const inside = admitted.some(root => real === root || real.startsWith(root + sep))
  if (!inside) return { ok: false, refusal: { status: 403, error: 'outside-workspace' } }
  return { ok: true, value: { path: real, isDirectory: info.isDirectory(), size: info.size } }
}
