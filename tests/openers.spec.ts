// @vitest-environment node
/**
 * Platform command tables. Each action must produce a shell-free argv whose
 * last element is the target under the caller's control, and an unsupported
 * platform must produce nothing at all rather than a guessed command.
 */
import { describe, expect, it } from 'vitest'
import { appArgv, defaultOpenArgv, fileManagerOf, platformOf, revealArgv, urlArgv } from '../src/openers.ts'

describe('defaultOpenArgv', () => {
  it('uses the documented opener per platform', () => {
    expect(defaultOpenArgv('/w/a.ts', 'darwin')).toEqual(['open', '/w/a.ts'])
    expect(defaultOpenArgv('/w/a.ts', 'win32')).toEqual(['cmd', '/c', 'start', '', '/w/a.ts'])
    expect(defaultOpenArgv('/w/a.ts', 'linux')).toEqual(['xdg-open', '/w/a.ts'])
  })

  it('has no opener on an unsupported platform', () => {
    expect(defaultOpenArgv('/w/a.ts', 'other')).toBeUndefined()
  })
})

describe('revealArgv', () => {
  it('selects a file and opens a directory', () => {
    expect(revealArgv('/w/a.ts', false, 'darwin')).toEqual(['open', '-R', '/w/a.ts'])
    expect(revealArgv('/w/src', true, 'darwin')).toEqual(['open', '/w/src'])
    expect(revealArgv('C:\\w\\a.ts', false, 'win32')).toEqual(['explorer', '/select,C:\\w\\a.ts'])
    expect(revealArgv('/w/a.ts', false, 'linux')).toEqual(['xdg-open', '/w'])
  })

  it('has no file manager on an unsupported platform', () => {
    expect(revealArgv('/w/a.ts', false, 'other')).toBeUndefined()
  })
})

describe('urlArgv', () => {
  it('hands the URL to the platform default browser', () => {
    expect(urlArgv('https://example.com/', 'darwin')).toEqual(['open', 'https://example.com/'])
    expect(urlArgv('https://example.com/', 'linux')).toEqual(['xdg-open', 'https://example.com/'])
  })
})

describe('appArgv', () => {
  it('opens a file with a known editor', () => {
    expect(appArgv('vscode', '/w/a.ts', false, 'darwin')).toEqual(['open', '-a', 'Visual Studio Code', '/w/a.ts'])
    expect(appArgv('vscode', '/w/a.ts', false, 'linux')).toEqual(['code', '/w/a.ts'])
  })

  it('opens the containing directory for a terminal', () => {
    expect(appArgv('iterm', '/w/src/a.ts', false, 'darwin')).toEqual(['open', '-a', 'iTerm', '/w/src'])
    expect(appArgv('iterm', '/w/src', true, 'darwin')).toEqual(['open', '-a', 'iTerm', '/w/src'])
  })

  it('has no command for an unknown application', () => {
    expect(appArgv('nope', '/w/a.ts', false, 'darwin')).toBeUndefined()
  })
})

describe('host probes', () => {
  it('narrows the running platform', () => {
    expect(['darwin', 'win32', 'linux', 'other']).toContain(platformOf())
  })

  it('reports a file manager on macOS and Windows', async () => {
    expect(await fileManagerOf('darwin')).toBe('finder')
    expect(await fileManagerOf('win32')).toBe('explorer')
  })
})
