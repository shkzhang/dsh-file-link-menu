// @vitest-environment jsdom
/**
 * Load-path proof for the built browser bundle.
 *
 * The shell registers client bundles through `window.__ModuleLoader__.load`,
 * so this spec loads the real `lib/client.js` with a module-table stand-in,
 * runs the exported `apply` against a recording context, and renders the
 * registered component once. A throw here is exactly the throw the browser
 * would hit while composing its client rows.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is stubbed: the published package is
 * an ESM build that imports CSS, which Node cannot execute, and the shell
 * supplies it from its own module table anyway. The real prop contract is
 * checked by `tsc` against that package's published typings.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'

// The vitest config sets `root` to the plugin directory, so the suite always
// runs with the plugin as its working directory.
const pluginRoot = process.cwd()
const require = createRequire(join(pluginRoot, 'package.json'))

/** Set by a spec to prove the render boundary swallows a primitive failure. */
let menuShouldThrow = false

/** Minimal stand-in for the menu primitive: records props, renders the anchor. */
const menuCalls: Record<string, unknown>[] = []
const primitivesStub = {
  Menu: (props: Record<string, unknown>) => {
    if (menuShouldThrow) throw new Error('menu primitive refused the props')
    menuCalls.push(props)
    return createElement('span', { 'data-primitives-menu': 'stub' }, props.anchor as ReactNode)
  },
  Toast: (props: Record<string, unknown>) => createElement('span', { 'data-primitives-toast': 'stub' }, String(props.text ?? '')),
}

/** Platform modules the shell seeds into the client module table. */
const PLATFORM: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

interface Loaded {
  readonly exports: Record<string, unknown>
}

/** Load the built bundle the way the shell's module loader does. */
function loadBundle(): Loaded {
  let loaded: Loaded | undefined
  const loaderWindow = globalThis as unknown as {
    __ModuleLoader__?: { load(record: { id: string; factory: (require: (name: string) => unknown) => unknown }): void }
  }
  loaderWindow.__ModuleLoader__ = {
    load(record) {
      loaded = {
        exports: record.factory((name: string) => {
          if (!PLATFORM.includes(name)) throw new Error(`undeclared platform module: ${name}`)
          if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
          return require(name) as unknown
        }) as Record<string, unknown>,
      }
    },
  }
  const code = readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8')
  // eslint-disable-next-line no-new-func -- the bundle is a script, not a module
  new Function('window', code)(loaderWindow)
  if (loaded === undefined) throw new Error('bundle did not register through the module loader')
  return loaded
}

/** Recording fixture for the client services `apply` touches. */
function contextFixture(): {
  ctx: Record<string, unknown>
  registrations: Record<string, unknown>[]
  injected: string[]
  dictionaries: { namespace: string }[]
} {
  const registrations: Record<string, unknown>[] = []
  const injected: string[] = []
  const dictionaries: { namespace: string }[] = []
  const services: Record<string, unknown> = {}
  const target = {
    get: (name: string) => services[name],
    effect: (run: () => unknown) => { run() },
    locale: {
      register: (namespace: string, dicts: unknown) => { dictionaries.push({ namespace, dicts } as { namespace: string }) },
    },
    slots: {
      inject: (name: string, run: () => unknown) => { run(); injected.push(name) },
      register: (options: Record<string, unknown>, component: unknown) => {
        registrations.push({ ...options, component })
        return () => {}
      },
    },
  }
  // Cordis throws for a service a plugin did not declare; the plugin must read
  // optional services through `get` and never depend on the property proxy.
  const ctx = new Proxy(target, {
    get(source, key, receiver) {
      if (key in source) return Reflect.get(source, key, receiver)
      throw new Error(`cannot get property "${String(key)}" without inject`)
    },
  })
  return { ctx: ctx as unknown as Record<string, unknown>, registrations, injected, dictionaries }
}

describe('built client bundle', () => {
  it('registers through the module loader and exports the plugin face', () => {
    const loaded = loadBundle()
    // A client row identifies itself by package, so the face is apply/inject.
    expect(loaded.exports.apply).toBeTypeOf('function')
    expect(loaded.exports.inject).toEqual(['slots', 'locale'])
  })

  it('names every external from the shell module table', () => {
    const code = readFileSync(join(pluginRoot, 'lib/client.js'), 'utf8')
    const required = [...code.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1] ?? '')
      .filter(name => !name.startsWith('.'))
    expect([...new Set(required)].filter(name => !PLATFORM.includes(name))).toEqual([])
  })

  it('applies without throwing and registers one dictionary set and one entry', () => {
    const loaded = loadBundle()
    const { ctx, registrations, dictionaries } = contextFixture()
    ;(loaded.exports.apply as (ctx: unknown) => void)(ctx)
    expect(dictionaries).toHaveLength(1)
    expect(dictionaries[0]?.namespace).toBe('dsh.fileLinkMenu')
    expect(registrations).toHaveLength(1)
    const entry = registrations[0] ?? {}
    expect(entry.name).toBe('conversation.input.overlay')
    expect(entry.id).toBe('file-link-menu')
    expect(entry.locale).toBe('dsh.fileLinkMenu')
    expect(entry.component).toBeTypeOf('function')
  })

  it('renders the registered component with the props the framework supplies', () => {
    const loaded = loadBundle()
    const { ctx, registrations } = contextFixture()
    ;(loaded.exports.apply as (ctx: unknown) => void)(ctx)
    const entry = registrations[0] ?? {}
    const component = entry.component as (props: unknown) => unknown
    const inject = entry.inject as (sessionId: string) => Record<string, unknown>
    const markup = renderToStaticMarkup(createElement(
      component as never,
      { ...inject('session-under-test'), t: (key: string) => key },
    ))
    expect(markup).toContain('data-dsh-file-link-menu-anchor')
    expect(menuCalls.at(-1)).toMatchObject({ open: false, portal: true })
  })

  it('never lets a registration failure escape apply', () => {
    const loaded = loadBundle()
    const { ctx, registrations } = contextFixture()
    ;(ctx.locale as { register: unknown }).register = () => { throw new Error('locale service refused the dictionary') }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => { (loaded.exports.apply as (ctx: unknown) => void)(ctx) }).not.toThrow()
    expect(registrations).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('keeps a failing menu from breaking the surrounding render', async () => {
    // Error boundaries only run on the client renderer, which is also the
    // renderer the shell uses in the browser.
    const loaded = loadBundle()
    const { ctx, registrations } = contextFixture()
    ;(loaded.exports.apply as (ctx: unknown) => void)(ctx)
    const entry = registrations[0] ?? {}
    const inject = entry.inject as (sessionId: string) => Record<string, unknown>
    const { createRoot } = await import('react-dom/client')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    menuShouldThrow = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      root.render(createElement(entry.component as never, { ...inject('s1'), t: (key: string) => key }))
      await new Promise(resolve => { setTimeout(resolve, 50) })
      expect(host.innerHTML).not.toContain('data-dsh-file-link-menu-anchor')
    } finally {
      menuShouldThrow = false
      root.unmount()
      errorSpy.mockRestore()
    }
  })

  it('opens a link menu from a right-click and runs the copy action', async () => {
    const loaded = loadBundle()
    const { ctx, registrations } = contextFixture()
    ;(loaded.exports.apply as (ctx: unknown) => void)(ctx)
    const entry = registrations[0] ?? {}
    const component = entry.component as (props: unknown) => unknown
    const inject = entry.inject as (sessionId: string) => Record<string, unknown>
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      platform: 'darwin', fileManager: 'finder', desktop: true, apps: ['vscode'],
      openUrl: true, saveAs: true, saveLink: true,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchSpy)
    const clipboard = { writeText: vi.fn(async () => {}) }
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
    const { createRoot } = await import('react-dom/client')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(createElement(component as never, { ...inject('s1'), t: (key: string) => key }))
    await new Promise(resolve => { setTimeout(resolve, 50) })

    const anchor = document.createElement('a')
    anchor.setAttribute('href', 'https://example.com/doc')
    document.body.append(anchor)
    anchor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await new Promise(resolve => { setTimeout(resolve, 50) })

    const menu = menuCalls.at(-1)
    expect(menu?.open).toBe(true)
    const items = menu?.items as { id: string }[]
    // The link menu is two groups: browser hand-off, then link copies.
    expect(items.map(item => item.id))
      .toEqual(['link.openTab', 'link.openExternal', 'link.separator', 'link.copy', 'link.saveAs'])

    ;(menu?.onSelect as (id: string) => void)('link.copy')
    await new Promise(resolve => { setTimeout(resolve, 50) })
    expect(clipboard.writeText).toHaveBeenCalledWith('https://example.com/doc')
    root.unmount()
    vi.unstubAllGlobals()
  })
})
