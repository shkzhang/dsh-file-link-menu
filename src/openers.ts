/**
 * Platform launch commands and application probing.
 *
 * Every command is an argv array handed to `spawn` without a shell, so a path
 * containing quotes, spaces, or `;` is one argument and never a command. The
 * application table mirrors the ids the shell's own open-in-app catalog
 * publishes, so a menu row can reuse the catalog's icon route.
 */
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { CapsFileManager, CapsPlatform } from './shared.ts'

/** Node's platform narrowed to what this plugin distinguishes. */
export function platformOf(): CapsPlatform {
  const value = process.platform
  return value === 'darwin' || value === 'win32' || value === 'linux' ? value : 'other'
}

/** One launchable application: where to probe it, and how to start it. */
interface AppRecord {
  readonly id: string
  /** macOS bundle probed under the application directories. */
  readonly macBundle?: string
  /** macOS `open -a` application name. */
  readonly macApp?: string
  /** Executable probed on `PATH` on every other platform. */
  readonly cli?: string
  /** Fixed arguments a CLI launch takes before the target. */
  readonly cliArgs?: readonly string[]
  /** Launch the containing directory rather than the file itself. */
  readonly directory?: boolean
  /** Directory this record's bundle is probed in, default the application dirs. */
  readonly macDir?: string
}

/** Editors, terminals, and file managers this plugin can start. */
const APPS: readonly AppRecord[] = [
  { id: 'vscode', macBundle: 'Visual Studio Code.app', macApp: 'Visual Studio Code', cli: 'code' },
  { id: 'vscodeinsiders', macBundle: 'Visual Studio Code - Insiders.app', macApp: 'Visual Studio Code - Insiders', cli: 'code-insiders' },
  { id: 'cursor', macBundle: 'Cursor.app', macApp: 'Cursor', cli: 'cursor' },
  { id: 'zed', macBundle: 'Zed.app', macApp: 'Zed', cli: 'zed' },
  { id: 'windsurf', macBundle: 'Windsurf.app', macApp: 'Windsurf', cli: 'windsurf' },
  { id: 'sublimetext', macBundle: 'Sublime Text.app', macApp: 'Sublime Text', cli: 'subl' },
  { id: 'xcode', macBundle: 'Xcode.app', macApp: 'Xcode' },
  { id: 'ghostty', macBundle: 'Ghostty.app', macApp: 'Ghostty', cli: 'ghostty', directory: true },
  { id: 'iterm', macBundle: 'iTerm.app', macApp: 'iTerm', directory: true },
  { id: 'warp', macBundle: 'Warp.app', macApp: 'Warp', directory: true },
  { id: 'kitty', cli: 'kitty', cliArgs: ['--working-directory'], directory: true },
  { id: 'terminal', macBundle: 'Terminal.app', macDir: '/System/Applications/Utilities', macApp: 'Terminal', cli: 'gnome-terminal', cliArgs: ['--working-directory'], directory: true },
]

/** Application directories probed on macOS, most specific first. */
function macApplicationDirs(): readonly string[] {
  return ['/Applications', '/System/Applications', '/System/Applications/Utilities', join(homedir(), 'Applications')]
}

/** Whether one filesystem entry exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** Search `PATH` for one executable name, honouring the platform suffixes. */
async function findOnPath(cli: string): Promise<boolean> {
  const path = process.env.PATH ?? ''
  const suffixes = process.platform === 'win32' ? ['', '.cmd', '.exe', '.bat'] : ['']
  for (const dir of path.split(delimiter)) {
    if (dir.length === 0) continue
    for (const suffix of suffixes) {
      if (await exists(join(dir, cli + suffix))) return true
    }
  }
  return false
}

/**
 * Probe which applications this Host can actually launch.
 * @param platform - narrowed host platform.
 * @returns launchable application ids in menu order.
 */
export async function probeApps(platform: CapsPlatform): Promise<readonly string[]> {
  const found: string[] = []
  for (const app of APPS) {
    if (platform === 'darwin') {
      if (app.macBundle === undefined) continue
      const dirs = app.macDir === undefined ? macApplicationDirs() : [app.macDir]
      for (const dir of dirs) {
        if (await exists(join(dir, app.macBundle))) {
          found.push(app.id)
          break
        }
      }
      continue
    }
    if (app.cli === undefined) continue
    if (await findOnPath(app.cli)) found.push(app.id)
  }
  return found
}

/** The Host file manager flavour, or null when the host has none. */
export async function fileManagerOf(platform: CapsPlatform): Promise<CapsFileManager> {
  if (platform === 'darwin') return 'finder'
  if (platform === 'win32') return 'explorer'
  if (platform === 'linux') return await findOnPath('xdg-open') ? 'directory' : null
  return null
}

/** Whether this Host has a desktop session at all. */
export async function desktopAvailable(platform: CapsPlatform, fileManager: CapsFileManager): Promise<boolean> {
  if (platform === 'darwin' || platform === 'win32') return true
  return fileManager !== null
}

/**
 * Command opening one path with the OS default application.
 * @param path - absolute path accepted by `authorizePath`.
 * @param platform - narrowed host platform.
 * @returns argv, or undefined when this platform has no opener.
 */
export function defaultOpenArgv(path: string, platform: CapsPlatform): readonly string[] | undefined {
  if (platform === 'darwin') return ['open', path]
  if (platform === 'win32') return ['cmd', '/c', 'start', '', path]
  if (platform === 'linux') return ['xdg-open', path]
  return undefined
}

/**
 * Command selecting one path in the Host file manager.
 * @param path - absolute path accepted by `authorizePath`.
 * @param isDirectory - whether the path is a directory, which some managers open instead of selecting.
 * @param platform - narrowed host platform.
 * @returns argv, or undefined when this platform has no file manager.
 */
export function revealArgv(path: string, isDirectory: boolean, platform: CapsPlatform): readonly string[] | undefined {
  if (platform === 'darwin') return isDirectory ? ['open', path] : ['open', '-R', path]
  if (platform === 'win32') return ['explorer', `/select,${path}`]
  if (platform === 'linux') return ['xdg-open', isDirectory ? path : join(path, '..')]
  return undefined
}

/**
 * Command handing one URL to the OS default browser.
 * @param url - validated http(s) URL.
 * @param platform - narrowed host platform.
 * @returns argv, or undefined when this platform has no browser hand-off.
 */
export function urlArgv(url: string, platform: CapsPlatform): readonly string[] | undefined {
  if (platform === 'darwin') return ['open', url]
  if (platform === 'win32') return ['cmd', '/c', 'start', '', url]
  if (platform === 'linux') return ['xdg-open', url]
  return undefined
}

/**
 * Command opening one path with a probed application.
 * @param appId - id from {@link probeApps}.
 * @param path - absolute path accepted by `authorizePath`.
 * @param isDirectory - whether the path is a directory.
 * @param platform - narrowed host platform.
 * @returns argv, or undefined for an id this plugin cannot launch.
 */
export function appArgv(appId: string, path: string, isDirectory: boolean, platform: CapsPlatform): readonly string[] | undefined {
  const app = APPS.find(candidate => candidate.id === appId)
  if (app === undefined) return undefined
  const target = app.directory === true ? (isDirectory ? path : dirnameOf(path)) : path
  if (platform === 'darwin') {
    if (app.macApp === undefined) return undefined
    return ['open', '-a', app.macApp, target]
  }
  if (app.cli === undefined) return undefined
  return [app.cli, ...(app.cliArgs ?? []), target]
}

/** Parent directory without importing `node:path` twice. */
function dirnameOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index <= 0 ? path : path.slice(0, index)
}
