// @vitest-environment node
/**
 * Host plugin body.
 *
 * The context property proxy throws for a service a plugin did not declare in
 * `inject`, which is exactly how an optional lookup used to turn every route
 * into an unhandled handler failure. These cases pin the lookup that must
 * report absence instead: the plugin registers its routes either way.
 */
import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.ts'

/**
 * A context shaped like cordis: declared services read as properties, and any
 * other property read throws, while `get` answers for registered services.
 */
function hostContext(provided: Record<string, unknown>): {
  ctx: Record<string, unknown>
  routes: string[]
  warnings: string[]
} {
  const routes: string[] = []
  const warnings: string[] = []
  const target: Record<string, unknown> = {
    get: (service: string) => provided[service],
    effect: (run: () => unknown) => { run() },
    logger: { warn: (message: string) => { warnings.push(message) } },
    webServer: provided.webServer,
    connection: provided.connection,
  }
  const ctx = new Proxy(target, {
    get(source, key, receiver) {
      if (key in source) return Reflect.get(source, key, receiver)
      throw new Error(`cannot get property "${String(key)}" without inject`)
    },
  })
  return { ctx: ctx as Record<string, unknown>, routes, warnings }
}

/** The web server stand-in recording every registered path. */
function webServer(routes: string[]): { register: (route: { path: string }) => () => void } {
  return { register: (route) => { routes.push(route.path); return () => {} } }
}

describe('host plugin face', () => {
  it('declares the two services its routes cannot work without', () => {
    expect(name).toBe('dsh-file-link-menu')
    expect(inject).toEqual(['webServer', 'connection'])
  })

  it('registers every route when optional services are only reachable through ctx.get', () => {
    const recorder: string[] = []
    const { ctx } = hostContext({
      webServer: webServer(recorder),
      connection: { requestRejection: () => undefined },
      sessionQuery: { readSession: async () => ({ session: { cwd: '/tmp' } }) },
      sandboxPolicy: { workspaceRoot: '/tmp' },
    })
    expect(() => { apply(ctx as never) }).not.toThrow()
    expect(recorder).toEqual([
      '/api/dsh-file-link-menu/caps',
      '/api/dsh-file-link-menu/attachment',
      '/api/dsh-file-link-menu/open',
      '/api/dsh-file-link-menu/reveal',
      '/api/dsh-file-link-menu/open-with',
      '/api/dsh-file-link-menu/download',
      '/api/dsh-file-link-menu/open-url',
      '/api/dsh-file-link-menu/download-link',
      '/api/dsh-file-link-menu/save-as',
      '/api/dsh-file-link-menu/save-link-as',
    ])
  })

  it('still registers when the composition provides no optional services at all', () => {
    const recorder: string[] = []
    const { ctx } = hostContext({
      webServer: webServer(recorder),
      connection: { requestRejection: () => undefined },
    })
    expect(() => { apply(ctx as never) }).not.toThrow()
    expect(recorder).toHaveLength(10)
  })

  it('warns instead of throwing when the route carrier is missing', () => {
    const { ctx, warnings } = hostContext({})
    expect(() => { apply(ctx as never) }).not.toThrow()
    expect(warnings.join('\n')).toContain('no routes registered')
  })

  it('registers its routes even when the session store refuses reads', () => {
    const recorder: string[] = []
    const { ctx, warnings } = hostContext({
      webServer: webServer(recorder),
      connection: { requestRejection: () => undefined },
      sessionQuery: { readSession: async () => { throw new Error('session store offline') } },
    })
    apply(ctx as never)
    expect(recorder).toHaveLength(10)
    expect(warnings).toEqual([])
  })
})
