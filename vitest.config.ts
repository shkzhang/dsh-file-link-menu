import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

/**
 * React entry the test renderer and the components share.
 *
 * The plugin carries react and react-dom as devDependencies, so resolving from
 * its own manifest names exactly one copy; the test renderer and the components
 * must not mount hooks on two instances.
 */
const pluginRequire = createRequire(new URL('./package.json', import.meta.url))

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    // Node's `--webstorage` flag provides a global localStorage that collides
    // with the jsdom one; dropping it keeps `window.localStorage` the single
    // authority the components read.
    execArgv: process.allowedNodeEnvironmentFlags.has('--webstorage') ? ['--no-webstorage'] : [],
    pool: 'forks',
  },
  resolve: {
    alias: [
      { find: /^react\/jsx-runtime$/, replacement: pluginRequire.resolve('react/jsx-runtime') },
      { find: /^react-dom\/server$/, replacement: pluginRequire.resolve('react-dom/server') },
      { find: /^react-dom$/, replacement: pluginRequire.resolve('react-dom') },
      { find: /^react$/, replacement: pluginRequire.resolve('react') },
    ],
  },
})
