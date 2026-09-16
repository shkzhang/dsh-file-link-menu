// @vitest-environment node
/**
 * Attachment name lookup. dsh's store is content-addressed, so an attachment
 * card's file name is searched rather than derived; these cases pin what the
 * lookup accepts, which of several same-named files it answers with, and how
 * long one answer stays cached.
 */
import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { attachmentNameIsSafe, attachmentStoreRoot, createAttachmentLookup } from '../src/attachments.ts'

let store = ''
let now = 0
let warnings: string[] = []

/** Two distinct digests with the same display names, as two pastes would produce. */
const FIRST = 'aa'.repeat(32)
const SECOND = 'bb'.repeat(32)

/**
 * Publish one stored alias, the way the local attachment backend does.
 * @param digest - 64 hex characters naming the stored content.
 * @param name - display name the alias carries.
 * @param seconds - write time, in seconds, that decides which alias is newest.
 * @returns the absolute alias path.
 */
async function alias(digest: string, name: string, seconds: number): Promise<string> {
  const directory = join(store, 'files', digest.slice(0, 2), digest)
  await mkdir(directory, { recursive: true })
  const path = join(directory, name)
  await writeFile(path, `${name}\n`)
  await utimes(path, seconds, seconds)
  return path
}

/** The lookup under test, with this spec's clock and logger. */
function lookup(): (name: unknown) => Promise<{ path: string; bytes: number } | undefined> {
  return createAttachmentLookup({
    store: { root: store },
    warn: (message) => { warnings.push(message) },
    now: () => now,
  })
}

beforeEach(async () => {
  store = join(await realpath(await mkdtemp(join(tmpdir(), 'flm-att-'))), 'attachments')
  await mkdir(join(store, 'files'), { recursive: true })
  now = 1_000_000
  warnings = []
})

describe('attachmentStoreRoot', () => {
  it('reads the root a host-file-backed backend exposes', () => {
    expect(attachmentStoreRoot({ root: '/tmp/attachments/v1' })).toBe('/tmp/attachments/v1')
  })

  it('answers undefined for a backend without a root', () => {
    expect(attachmentStoreRoot(undefined)).toBeUndefined()
    expect(attachmentStoreRoot({})).toBeUndefined()
    expect(attachmentStoreRoot({ root: '' })).toBeUndefined()
  })
})

describe('attachmentNameIsSafe', () => {
  it('accepts one plain path segment, whatever it contains', () => {
    expect(attachmentNameIsSafe('20260916-112511232.txt')).toBe(true)
    expect(attachmentNameIsSafe('两份 报告 (final).md')).toBe(true)
    expect(attachmentNameIsSafe('a'.repeat(255))).toBe(true)
  })

  it('refuses a separator, a control character, and an empty or absent name', () => {
    expect(attachmentNameIsSafe('a/b.txt')).toBe(false)
    expect(attachmentNameIsSafe('a\\b.txt')).toBe(false)
    expect(attachmentNameIsSafe('a\u0000b')).toBe(false)
    expect(attachmentNameIsSafe('a\nb')).toBe(false)
    expect(attachmentNameIsSafe('')).toBe(false)
    expect(attachmentNameIsSafe(42)).toBe(false)
    expect(attachmentNameIsSafe(undefined)).toBe(false)
  })

  it('refuses the two names that would step out of the searched directory', () => {
    expect(attachmentNameIsSafe('.')).toBe(false)
    expect(attachmentNameIsSafe('..')).toBe(false)
  })

  it('refuses a name longer than the store itself writes', () => {
    expect(attachmentNameIsSafe('a'.repeat(256))).toBe(false)
    expect(attachmentNameIsSafe('报'.repeat(86))).toBe(false)
  })
})

describe('createAttachmentLookup', () => {
  it('finds the stored path of one name', async () => {
    const path = await alias(FIRST, 'paste.txt', 10)
    expect(await lookup()('paste.txt')).toEqual({ path, bytes: 10 })
  })

  it('answers the most recently written of several same-named files', async () => {
    await alias(FIRST, 'notes.txt', 10)
    const newest = await alias(SECOND, 'notes.txt', 20)
    expect(await lookup()('notes.txt')).toEqual({ path: newest, bytes: 10 })
  })

  it('answers undefined for a name the store does not hold', async () => {
    await alias(FIRST, 'paste.txt', 10)
    expect(await lookup()('other.txt')).toBeUndefined()
  })

  it('refuses an unsafe name without searching', async () => {
    expect(await lookup()('../../etc/passwd')).toBeUndefined()
    expect(await lookup()(undefined)).toBeUndefined()
    expect(warnings).toEqual([])
  })

  it('ignores a directory that is not a shard or an object', async () => {
    await alias(FIRST, 'paste.txt', 10)
    await mkdir(join(store, 'files', 'zz'), { recursive: true })
    await writeFile(join(store, 'files', 'zz', 'paste.txt'), 'not an object\n')
    const path = await alias(SECOND, 'paste.txt', 20)
    expect(await lookup()('paste.txt')).toEqual({ path, bytes: 10 })
  })

  it('keeps one answer for the cache window and refreshes after it', async () => {
    const lookupOnce = lookup()
    const first = await alias(FIRST, 'notes.txt', 10)
    expect(await lookupOnce('notes.txt')).toEqual({ path: first, bytes: 10 })
    // A second file written inside the window is not re-scanned for.
    const second = await alias(SECOND, 'notes.txt', 20)
    expect((await lookupOnce('notes.txt'))?.path).toBe(first)
    now += 60_000
    expect((await lookupOnce('notes.txt'))?.path).toBe(second)
  })

  it('reports an unreadable store once and answers nothing', async () => {
    const missing = createAttachmentLookup({
      store: { root: join(store, 'gone') },
      warn: (message) => { warnings.push(message) },
    })
    expect(await missing('paste.txt')).toBeUndefined()
    expect(warnings).toHaveLength(1)
  })

  it('answers nothing when the composition mounts no attachment store', async () => {
    const absent = createAttachmentLookup({ store: undefined, warn: () => {} })
    expect(await absent('paste.txt')).toBeUndefined()
  })
})
