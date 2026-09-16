/**
 * Build both halves of dsh-file-link-menu: the Host plugin as ESM, and the
 * browser bundle the shell's module loader registers. Copied from the sibling
 * plugins' build so every local plugin produces the same artifact layout.
 */
import { rm, mkdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const lib = new URL('./lib/', root)
const manifest = JSON.parse(await readFile(new URL('./package.json', root), 'utf8'))

await rm(lib, { recursive: true, force: true })
await mkdir(new URL('./types/', lib), { recursive: true })

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('./node_modules/typescript/bin/tsc', root)),
    '-p', fileURLToPath(new URL('./tsconfig.json', root)),
    '--emitDeclarationOnly',
  ], { cwd: root, stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', code => code === 0
    ? resolve()
    : reject(new Error(`TypeScript declaration build exited with ${String(code)}`)))
})

await build({
  entryPoints: [fileURLToPath(new URL('./src/index.ts', root))],
  outfile: fileURLToPath(new URL('./index.js', lib)),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
})

const cssModules = {
  name: 'file-link-menu-css-modules',
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, async args => {
      const source = await readFile(args.path, 'utf8')
      const names = [...source.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)\s*\{/g)].map(match => match[1])
      // Scope every class by its own stylesheet: two plugin modules may both
      // declare `.row`, and a shared prefix would let the first injected rule
      // win for the other module's elements.
      const file = (new URL(args.path, 'file:').pathname.split('/').pop() ?? '')
        .replace(/\.module\.css$/u, '')
        .replace(/[^A-Za-z0-9]+/gu, '')
      const scope = file === '' ? 'style' : file
      const classes = Object.fromEntries(names.map(name => [name, `dsh-flm-${scope}-${name}`]))
      const rewritten = source.replace(/\.([A-Za-z_][A-Za-z0-9_-]*)/g, (_, name) => `.${classes[name] ?? name}`)
      return {
        contents: `if (typeof document !== 'undefined') { const style = document.createElement('style'); style.dataset.pluginCss = ${JSON.stringify(`dsh-file-link-menu/${scope}`)}; style.textContent = ${JSON.stringify(rewritten)}; document.head.appendChild(style); } export default ${JSON.stringify(classes)};`,
        loader: 'js',
        resolveDir: new URL('.', `file://${args.path}`).pathname,
      }
    })
  },
}

await build({
  entryPoints: [fileURLToPath(new URL('./src/client/index.ts', root))],
  outfile: fileURLToPath(new URL('./client.js', lib)),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  // Platform modules come from the shell's frozen module table; bundling them
  // would duplicate React, the slot runtime, and every shared primitive.
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-dockkit',
  ],
  loader: { '.css': 'empty', '.svg': 'text' },
  // The client runtime is a browser bundle: `process.env.*` reads that the
  // official client build substitutes at build time must not survive into it.
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.DSH_CLIENT_VERSION': JSON.stringify(manifest.version),
    'process.env.DSH_CLIENT_COMMIT_HASH': JSON.stringify(''),
    'process.env.DSH_CLIENT_GIT_DIRTY': JSON.stringify('false'),
  },
  banner: { js: `var module = { exports: {} }; var exports = module.exports; window.__ModuleLoader__.load({ id: ${JSON.stringify('dsh-file-link-menu')}, factory: (require) => {` },
  footer: { js: 'return module.exports; } });' },
  plugins: [cssModules],
})
