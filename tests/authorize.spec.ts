// @vitest-environment node
/**
 * Root confinement. The browser sends a path read off the DOM, so these cases
 * pin what the Host refuses: URLs, missing files, and every path that leaves
 * both admitted roots, including through a symlink. The second root stands in
 * for dsh's attachment store, which sits outside every Session workspace.
 */
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { authorizePath } from '../src/authorize.ts'

let root = ''
let outside = ''

/**
 * Write one stored attachment below this spec's second root.
 * @returns the absolute path of the written file.
 */
async function attachment(): Promise<string> {
  const store = join(outside, 'attachments')
  await mkdir(store, { recursive: true })
  const path = join(store, 'paste.txt')
  await writeFile(path, 'pasted\n')
  return path
}

beforeEach(async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'flm-')))
  root = join(base, 'workspace')
  outside = join(base, 'outside')
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(outside, { recursive: true })
  await writeFile(join(root, 'README.md'), '# readme\n')
  await writeFile(join(root, 'src', 'a.ts'), 'export {}\n')
  await writeFile(join(outside, 'secret.txt'), 'secret\n')
})

afterEach(() => { root = ''; outside = '' })

describe('authorizePath', () => {
  it('accepts a workspace file given by absolute path', async () => {
    const decision = await authorizePath({ workspace: root }, join(root, 'README.md'))
    expect(decision).toEqual({ ok: true, value: { path: join(root, 'README.md'), isDirectory: false, size: 9 } })
  })

  it('accepts a workspace file given relative to the root', async () => {
    const decision = await authorizePath({ workspace: root }, 'src/a.ts')
    expect(decision.ok && decision.value.path).toBe(join(root, 'src', 'a.ts'))
  })

  it('reports a directory as one', async () => {
    const decision = await authorizePath({ workspace: root }, join(root, 'src'))
    expect(decision.ok && decision.value.isDirectory).toBe(true)
  })

  it('refuses a path outside the workspace', async () => {
    const decision = await authorizePath({ workspace: root }, join(outside, 'secret.txt'))
    expect(decision).toEqual({ ok: false, refusal: { status: 403, error: 'outside-workspace' } })
  })

  it('refuses a traversal that escapes the workspace', async () => {
    const decision = await authorizePath({ workspace: root }, '../outside/secret.txt')
    expect(decision.ok).toBe(false)
  })

  it('refuses a symlink pointing outside the workspace', async () => {
    await symlink(join(outside, 'secret.txt'), join(root, 'link.txt'))
    const decision = await authorizePath({ workspace: root }, join(root, 'link.txt'))
    expect(decision).toEqual({ ok: false, refusal: { status: 403, error: 'outside-workspace' } })
  })

  it('accepts a file: address naming a workspace file', async () => {
    const decision = await authorizePath({ workspace: root }, `file://${join(root, 'README.md')}`)
    expect(decision.ok && decision.value.path).toBe(join(root, 'README.md'))
  })

  it('refuses a file: address outside the workspace', async () => {
    const decision = await authorizePath({ workspace: root }, `file://${join(outside, 'secret.txt')}`)
    expect(decision).toEqual({ ok: false, refusal: { status: 403, error: 'outside-workspace' } })
  })

  it('refuses a URL-shaped value', async () => {
    const decision = await authorizePath({ workspace: root }, 'https://example.com/a')
    expect(decision).toEqual({ ok: false, refusal: { status: 400, error: 'invalid-path' } })
  })

  it('refuses a non-string or empty value', async () => {
    expect(await authorizePath({ workspace: root }, 42)).toEqual({ ok: false, refusal: { status: 400, error: 'invalid-path' } })
    expect(await authorizePath({ workspace: root }, '')).toEqual({ ok: false, refusal: { status: 400, error: 'invalid-path' } })
  })

  it('reports a missing file', async () => {
    const decision = await authorizePath({ workspace: root }, join(root, 'gone.txt'))
    expect(decision).toEqual({ ok: false, refusal: { status: 404, error: 'missing' } })
  })

  it('refuses every path while the Session workspace is unknown', async () => {
    const decision = await authorizePath(undefined, '/etc/passwd')
    expect(decision).toEqual({ ok: false, refusal: { status: 409, error: 'no-workspace' } })
  })

  it('accepts an attachment the Host stored outside the workspace', async () => {
    const stored = await attachment()
    const decision = await authorizePath({ workspace: root, attachments: join(outside, 'attachments') }, stored)
    expect(decision).toEqual({ ok: true, value: { path: stored, isDirectory: false, size: 7 } })
  })

  it('still refuses a path outside every admitted root', async () => {
    await attachment()
    const decision = await authorizePath(
      { workspace: root, attachments: join(outside, 'attachments') },
      join(outside, 'secret.txt'),
    )
    expect(decision).toEqual({ ok: false, refusal: { status: 403, error: 'outside-workspace' } })
  })

  it('resolves a relative path against the workspace, never the attachment store', async () => {
    await attachment()
    const decision = await authorizePath({ workspace: root, attachments: join(outside, 'attachments') }, 'paste.txt')
    expect(decision).toEqual({ ok: false, refusal: { status: 404, error: 'missing' } })
  })

  it('refuses a relative path when the workspace is unknown, even with a store', async () => {
    await attachment()
    const decision = await authorizePath({ attachments: join(outside, 'attachments') }, 'paste.txt')
    expect(decision).toEqual({ ok: false, refusal: { status: 409, error: 'no-workspace' } })
  })

  it('admits the roots that resolve when another one does not', async () => {
    const decision = await authorizePath(
      { workspace: root, attachments: join(outside, 'gone-store') },
      join(root, 'README.md'),
    )
    expect(decision.ok).toBe(true)
  })

  it('refuses every path when no root resolves', async () => {
    const decision = await authorizePath({ attachments: join(outside, 'gone-store') }, '/etc/passwd')
    expect(decision).toEqual({ ok: false, refusal: { status: 409, error: 'no-workspace' } })
  })
})
