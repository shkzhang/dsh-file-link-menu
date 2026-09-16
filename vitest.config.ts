import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

/**
 * React entry the test renderer and the components share.
 *
 * The plugin carries react and react-dom as devDependencies, so resolving
 * from its own manifest names exactly one copy; the test renderer and the
 * components must not mount hooks on two instances.
 */
const pluginRequire = createRequire(new URL('./package.json', import.meta.url))

export default defineConfig({
  root: repositoryRoot,
  plugins: [
    tsconfigPaths({ projects: [`${repositoryRoot}/tsconfig.base.json`] }),
    standardDecoratorPlugin(),
  ],
  test: {
    environment: 'jsdom',
    include: ['plugins/dsh-file-link-menu/tests/**/*.spec.ts', 'plugins/dsh-file-link-menu/tests/**/*.spec.tsx'],
    execArgv: vitestExecArgv,
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
