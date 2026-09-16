/**
 * Attachment lookup: file name in, stored path out.
 *
 * The composer and the transcript draw one card per attached file, and that
 * card carries the file name and nothing else — no path, no content address.
 * dsh's attachment store is content-addressed, so the name alone cannot name a
 * path: the store has to be searched for the leaf names it holds.
 *
 * The search is over the store's alias tree (`files/<xx>/<digest>/<name>`),
 * which is the same tree the Host's file tools read through the model-facing
 * read path. One name can be stored under several digests when two different
 * files were attached with the same name; the most recently written one wins,
 * which is the attachment the user just added.
 */
import { readdir, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'

/** The attachment backend, narrowed to the root this module searches. */
export interface AttachmentStoreService {
  /**
   * Absolute versioned storage root, present only on a host-file-backed
   * backend. A backend without it has no path to hand any route.
   */
  readonly root?: string
}

/** One stored attachment the lookup found. */
export interface ResolvedAttachment {
  /** Absolute path of the stored file, inside the store's `files` tree. */
  readonly path: string
  /** Stored byte length. */
  readonly bytes: number
}

/** One name matched to one stored alias. */
interface Found extends ResolvedAttachment {
  readonly mtimeMs: number
}

/** Lookup dependencies: the backend, the host logger, and the clock. */
export interface AttachmentLookupDeps {
  readonly store: AttachmentStoreService | undefined
  readonly warn: (message: string, error?: unknown) => void
  /** Current time in milliseconds; a test supplies its own to expire the cache deterministically. */
  readonly now?: () => number
}

/** A digest shard: the first byte of a SHA-256 digest, in lower-case hex. */
const SHARD_NAME = /^[0-9a-f]{2}$/u

/** One content-addressed object directory: a full lower-case hex SHA-256. */
const OBJECT_NAME = /^[0-9a-f]{64}$/u

/** Control characters, both separator styles, and the NUL a path test also refuses. */
const UNSAFE_NAME = /[\u0000-\u001f\u007f/\\]/u

/** Longest display name the store itself writes; `fileLeafName` cuts at 255 bytes. */
const MAX_NAME_BYTES = 255

/** Object directories one search visits before giving up, so a giant store cannot stall a route. */
const MAX_OBJECTS = 20_000

/** Time one found name stays cached; a repeat right-click must not rescan the store. */
const CACHE_TTL_MS = 5_000

/**
 * The store root this Host can search.
 * @param store - the composition's attachment backend, when it is mounted.
 * @returns the absolute store root, or undefined when this backend has none.
 */
export function attachmentStoreRoot(store: AttachmentStoreService | undefined): string | undefined {
  const root = store?.root
  return typeof root === 'string' && root.length > 0 ? root : undefined
}

/**
 * Whether one string can be a stored attachment leaf name.
 *
 * The name arrives on a DOM `title`, so it is browser input: a separator would
 * let a card name a file outside the searched directory, `..` would step out of
 * it, and a control character has no place in a display name the store
 * sanitized. The store itself maps an empty or dot-only name to `file`, so
 * neither is a name it could have written.
 * @param value - candidate name.
 * @returns true when the name is a single safe path segment.
 */
export function attachmentNameIsSafe(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value === '.' || value === '..') return false
  if (UNSAFE_NAME.test(value)) return false
  return Buffer.byteLength(value) <= MAX_NAME_BYTES
}

/** Every stored alias of one name, newest first. */
async function search(store: string, name: string, warn: AttachmentLookupDeps['warn']): Promise<Found[]> {
  const files = join(store, 'files')
  let shards: Dirent[]
  try {
    shards = await readdir(files, { withFileTypes: true })
  } catch (error: unknown) {
    // A store that was never written to has no `files` tree; that is an empty
    // result, not a failure the user needs to hear about.
    warn(`attachment store is not readable at ${files}`, error)
    return []
  }
  const found: Found[] = []
  let visited = 0
  for (const shard of shards) {
    if (!shard.isDirectory() || !SHARD_NAME.test(shard.name)) continue
    const directory = join(files, shard.name)
    const objects = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const object of objects) {
      if (!object.isDirectory() || !OBJECT_NAME.test(object.name)) continue
      if (visited >= MAX_OBJECTS) return newestFirst(found)
      visited += 1
      const candidate = join(directory, object.name, name)
      const info = await stat(candidate).catch(() => undefined)
      if (info?.isFile() === true) found.push({ path: candidate, bytes: info.size, mtimeMs: info.mtimeMs })
    }
  }
  return newestFirst(found)
}

/** Sort matches by write time, newest first, with the path breaking a tie. */
function newestFirst(found: readonly Found[]): Found[] {
  return [...found].sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path))
}

/**
 * Build the name lookup the attachment route calls.
 * @param deps - the attachment backend, the host logger, and the clock.
 * @returns a lookup that answers one stored attachment by display name.
 */
export function createAttachmentLookup(
  deps: AttachmentLookupDeps,
): (name: unknown) => Promise<ResolvedAttachment | undefined> {
  const store = attachmentStoreRoot(deps.store)
  const now = deps.now ?? Date.now
  const cache = new Map<string, { at: number; found: ResolvedAttachment | undefined }>()
  return async (name: unknown): Promise<ResolvedAttachment | undefined> => {
    if (!attachmentNameIsSafe(name)) return undefined
    if (store === undefined) return undefined
    const hit = cache.get(name)
    const at = now()
    if (hit !== undefined && at - hit.at < CACHE_TTL_MS) return hit.found
    const [best] = await search(store, name, deps.warn)
    const found = best === undefined ? undefined : { path: best.path, bytes: best.bytes }
    cache.set(name, { at, found })
    return found
  }
}
