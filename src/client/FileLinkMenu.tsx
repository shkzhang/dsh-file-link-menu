/**
 * The right-click menu itself.
 *
 * One component is registered into the Session header utilities and renders
 * nothing visible: it watches `contextmenu` in the capture phase, claims only
 * the anchors `detectTarget` recognizes, and portals a `Menu` open at the
 * pointer. Every other context menu keeps the shell's own behavior, so the
 * deliverable cards' own menu and the desktop wrapper's menus stay intact.
 */
import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react'
import { Menu, Toast, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { CapsPayload } from '../shared.ts'
import { MenuActionError, type FileLinkMenuController } from './controller.ts'
import { NS, type FileLinkMenuKey } from './locales.ts'
import { attachmentTargetOf, detectTarget, type MenuTarget } from './surfaces.ts'

/** Business face injected into the composer's overlay contribution. */
export interface FileLinkMenuInjected {
  /**
   * The Session whose composer holds this entry, or an empty string when the
   * seat was injected without one. An attachment belongs to no Session, so the
   * attachment rows still work; only the workspace half of the Host's admitted
   * roots and the right-Sidebar preview need a named Session.
   */
  readonly sessionId: string
  readonly controller: FileLinkMenuController
  /**
   * Host directory chooser (`另存为` asks where to write first). Absent when
   * the composition has no workspace plugin; the row then falls back to the
   * browser's own attachment download.
   */
  readonly pickDirectory?: () => Promise<string | null>
  /**
   * Show one file beside the conversation, through the composition's right
   * Sidebar. Absent when no such Sidebar is mounted, or when it refuses the
   * address; an attachment click then opens the file with the Host instead.
   * @param path - absolute path of the file to show.
   */
  readonly previewFile?: (path: string) => void
}

/** Composed props of the header contribution. */
export type FileLinkMenuProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<FileLinkMenuInjected>

/** Submenu-parent row id; a child row is `file.openWith.<appId>`. */
const OPEN_WITH = 'file.openWith'
const OPEN_WITH_PREFIX = `${OPEN_WITH}.`

/** Application ids this plugin can name; an unnamed id is not offered. */
const APP_LABEL_KEYS: Readonly<Record<string, FileLinkMenuKey | undefined>> = {
  vscode: 'app.vscode',
  vscodeinsiders: 'app.vscodeinsiders',
  cursor: 'app.cursor',
  zed: 'app.zed',
  windsurf: 'app.windsurf',
  sublimetext: 'app.sublimetext',
  xcode: 'app.xcode',
  ghostty: 'app.ghostty',
  iterm: 'app.iterm',
  warp: 'app.warp',
  kitty: 'app.kitty',
  terminal: 'app.terminal',
}

/** Host failure codes mapped to the copy that explains them. */
const ERROR_KEYS: Readonly<Record<string, FileLinkMenuKey | undefined>> = {
  'copy-failed': 'error.copy',
  'network': 'error.fetch',
  'invalid-path': 'error.badRequest',
  'bad-request': 'error.badRequest',
  'outside-workspace': 'error.outsideWorkspace',
  'missing': 'error.missing',
  'no-workspace': 'error.noWorkspace',
  'unknown-attachment': 'error.unknownAttachment',
  'no-attachment-store': 'error.noAttachmentStore',
  'not-a-file': 'error.notAFile',
  'too-large': 'error.tooLarge',
  'unsupported-platform': 'error.unsupported',
  'unknown-app': 'error.unknownApp',
  'invalid-url': 'error.invalidUrl',
  'private-address': 'error.privateAddress',
  'unresolved-host': 'error.unresolvedHost',
  'fetch-failed': 'error.fetch',
  'bad-response': 'error.fetch',
  'too-many-redirects': 'error.fetch',
}

/** Reveal row label, following the Host file manager. */
function revealKey(caps: CapsPayload | null): FileLinkMenuKey {
  if (caps?.fileManager === 'explorer') return 'file.revealExplorer'
  if (caps?.fileManager === 'directory') return 'file.revealDirectory'
  return 'file.revealFinder'
}

/** Localized copy for one Host failure code. */
function errorKey(code: string): FileLinkMenuKey {
  const mapped = ERROR_KEYS[code]
  if (mapped !== undefined) return mapped
  return code.startsWith('remote-') ? 'error.remote' : 'error.generic'
}

/** The rows a target offers, given what the Host reported it can do. */
function menuItems(
  target: MenuTarget,
  caps: CapsPayload | null,
  t: FileLinkMenuProps['t'],
): readonly MenuEntry[] {
  if (target.kind === 'link') {
    const rows: MenuEntry[] = [{ id: 'link.openTab', label: t('link.openTab') }]
    if (caps?.openUrl === true) rows.push({ id: 'link.openExternal', label: t('link.openExternal') })
    rows.push({ type: 'separator', id: 'link.separator' })
    rows.push({ id: 'link.copy', label: t('link.copy') })
    if (caps?.saveLink === true) rows.push({ id: 'link.saveAs', label: t('link.saveAs') })
    return rows
  }
  const apps = (caps?.apps ?? []).filter(id => APP_LABEL_KEYS[id] !== undefined)
  const rows: MenuEntry[] = [{ id: 'file.open', label: t('file.open') }]
  if (apps.includes('vscode')) rows.push({ id: 'file.openInVscode', label: t('file.openInVscode') })
  if (apps.length > 0) {
    rows.push({
      id: OPEN_WITH,
      label: t('file.openWith'),
      submenu: apps.map(id => ({ id: `${OPEN_WITH_PREFIX}${id}`, label: t(APP_LABEL_KEYS[id] as FileLinkMenuKey) })),
    })
  }
  rows.push({ type: 'separator', id: 'file.separator.primary' })
  if (caps?.saveAs === true) rows.push({ id: 'file.saveAs', label: t('file.saveAs') })
  rows.push({ id: 'file.copyPath', label: t('file.copyPath') })
  if (caps?.desktop === true) {
    rows.push({ type: 'separator', id: 'file.separator.host' })
    rows.push({ id: 'file.reveal', label: t(revealKey(caps)) })
  }
  return rows
}

/**
 * Keeps a menu failure inside the menu.
 *
 * The contribution lives in the Session header's utilities row, so a render
 * throw there would take the header (and everything the shell draws around it)
 * down with it. A primitive that refuses these props drops the menu instead.
 */
class MenuBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[dsh-file-link-menu] menu render failed; the built-in menus are untouched', error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/** Where the menu is anchored for one open. */
interface MenuState {
  readonly target: MenuTarget
  readonly rect: DOMRect
}

/** The targets a file row can act on: a known path, or a name the Host resolves. */
type FileActionTarget = Extract<MenuTarget, { kind: 'file' } | { kind: 'attachment' }>

/**
 * Render the right-click menu for files and links, and the attachment preview.
 * @param props - Session identity, the action controller, and the locale seat.
 * @returns the portaled menu, plus a transient toast for action feedback.
 */
export function FileLinkMenuSurface({ sessionId, controller, pickDirectory, previewFile, t }: FileLinkMenuProps) {
  const [state, setState] = useState<MenuState | null>(null)
  const [caps, setCaps] = useState<CapsPayload | null>(controller.known)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void controller.loadCaps().then(loaded => { if (live) setCaps(loaded) })
    return () => { live = false }
  }, [controller])

  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 2) return
      const selection = globalThis.getSelection?.()?.toString() ?? ''
      const target = detectTarget(event.target as Element | null, selection)
      if (target === undefined) return
      event.preventDefault()
      event.stopPropagation()
      setState({ target, rect: new DOMRect(event.clientX, event.clientY, 0, 0) })
    }
    document.addEventListener('contextmenu', onContextMenu, true)
    return () => { document.removeEventListener('contextmenu', onContextMenu, true) }
  }, [])

  const items = useMemo(
    () => state === null ? [] : menuItems(state.target, caps, t),
    [state, caps, t],
  )

  const close = useCallback(() => { setState(null) }, [])
  const anchorRect = useCallback(() => state?.rect ?? null, [state])

  /** Report one failed action under its menu row id. */
  const fail = useCallback((id: string, error: unknown): void => {
    const code = error instanceof MenuActionError ? error.code : 'generic'
    console.warn(`[dsh-file-link-menu] ${id} failed: ${code}`)
    setToast(t(errorKey(code)))
  }, [t])

  /**
   * The path one file row acts on.
   *
   * A file target already carries it. An attachment target carries the display
   * name only — dsh's attachment store is content-addressed, so a name is not a
   * path — and the Host resolves it against the store it wrote.
   * @param target - the file or attachment the menu opened for.
   * @returns the absolute path the action runs against.
   */
  const pathOf = useCallback(
    async (target: FileActionTarget): Promise<string> => {
      if (target.kind === 'file') return target.path
      return (await controller.attachmentPath(target.name)).path
    },
    [controller],
  )

  /**
   * Show one attachment beside the conversation.
   *
   * The right Sidebar's file type reads any absolute path, so a stored
   * attachment renders there even though the store sits outside the Session
   * workspace. A composition without that Sidebar falls back to the Host's own
   * opener, which shows the same file the menu's first row does.
   * @param path - absolute path of the file to show.
   */
  const showAttachment = useCallback((path: string): void => {
    if (previewFile !== undefined) {
      try {
        previewFile(path)
        return
      } catch (error: unknown) {
        // A Sidebar that refuses the address is a wiring fault, not a reason to
        // drop the gesture: the Host can still open the file.
        console.warn('[dsh-file-link-menu] sidebar preview refused the file; opening it with the Host', error)
      }
    }
    void controller.open(sessionId, path).catch((error: unknown) => { fail('attachment.preview', error) })
  }, [previewFile, controller, sessionId, fail])

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0) return
      const node = event.target as Element | null
      const target = attachmentTargetOf(node)
      if (target?.kind !== 'attachment') return
      // A card's own controls keep their behaviour: removal and retry are
      // buttons inside the very card this claims, and the same rail holds the
      // composer's image thumbnails. A reference chip is itself a button, and
      // that one is exactly what this claims.
      const pressed = node?.closest('button')
      if (pressed != null && pressed.getAttribute('data-ref-chip') === null) return
      event.preventDefault()
      event.stopPropagation()
      void controller.attachmentPath(target.name).then(
        (found) => { showAttachment(found.path) },
        (error: unknown) => { fail('attachment.preview', error) },
      )
    }
    document.addEventListener('click', onClick, true)
    return () => { document.removeEventListener('click', onClick, true) }
  }, [controller, showAttachment, fail])

  /**
   * Ask the Host where to write, then run the save.
   *
   * Without a chooser the browser's attachment download is the only honest
   * option, so the row keeps working instead of disappearing.
   */
  const saveTo = useCallback((
    id: string,
    action: (directory: string) => Promise<string>,
    fallback: () => void,
  ): void => {
    if (pickDirectory === undefined) { fallback(); setToast(t('action.saveStarted')); return }
    void pickDirectory().then(
      (directory) => {
        if (directory === null || directory === '') { setToast(t('action.saveCancelled')); return }
        void action(directory).then(
          (saved) => { setToast(t('action.saved', { path: saved })) },
          (error: unknown) => { fail(id, error) },
        )
      },
      (error: unknown) => { fail(id, error) },
    )
  }, [pickDirectory, fail, t])

  const run = useCallback((id: string): void => {
    if (state === null) return
    const { target } = state
    setState(null)
    // Launching an application has no text result to report; copying and
    // downloading do, so only those rows ask for a toast.
    const report = (promise: Promise<void>, done?: FileLinkMenuKey): void => {
      void promise.then(
        () => { if (done !== undefined) setToast(t(done)) },
        (error: unknown) => {
          const code = error instanceof MenuActionError ? error.code : 'generic'
          console.warn(`[dsh-file-link-menu] ${id} failed: ${code}`)
          setToast(t(errorKey(code)))
        },
      )
    }
    try {
      if (target.kind === 'link') {
        if (id === 'link.openTab') {
          globalThis.open(target.url, '_blank', 'noopener,noreferrer')
          return
        }
        if (id === 'link.openExternal') { report(controller.openUrl(target.url)); return }
        if (id === 'link.copy') { report(controller.copyText(target.url), 'action.copied'); return }
        if (id === 'link.saveAs') {
          saveTo('link.saveAs', directory => controller.saveLinkAs(target.url, directory), () => { controller.downloadLink(target.url) })
          return
        }
        return
      }
      // Every file row runs against a path: the one its target carries, or the
      // one the Host resolves from an attachment's display name.
      const file: FileActionTarget = target
      const withPath = (use: (path: string) => void): void => {
        void pathOf(file).then(use, (error: unknown) => { fail(id, error) })
      }
      if (id === 'file.open') { withPath(path => { report(controller.open(sessionId, path)) }); return }
      if (id === 'file.openInVscode') { withPath(path => { report(controller.openWith(sessionId, path, 'vscode')) }); return }
      if (id === 'file.copyPath') { withPath(path => { report(controller.copyText(path), 'action.copied') }); return }
      if (id === 'file.saveAs') {
        withPath(path => {
          saveTo('file.saveAs', directory => controller.saveAs(sessionId, path, directory), () => { controller.download(sessionId, path) })
        })
        return
      }
      if (id === 'file.reveal') { withPath(path => { report(controller.reveal(sessionId, path)) }); return }
      if (id.startsWith(OPEN_WITH_PREFIX)) {
        const app = id.slice(OPEN_WITH_PREFIX.length)
        withPath(path => { report(controller.openWith(sessionId, path, app)) })
      }
    } catch (error: unknown) { // a synchronous throw must not leave the menu half-applied
      setToast(t(errorKey(error instanceof MenuActionError ? error.code : 'generic')))
    }
  }, [state, controller, sessionId, saveTo, pathOf, fail, t])

  return (
    <>
      <MenuBoundary>
      <Menu
        open={state !== null}
        anchor={<span data-dsh-file-link-menu-anchor hidden />}
        items={items}
        onSelect={run}
        onClose={close}
        portal
        selection="fill"
        autoFocus
        getAnchorRect={anchorRect}
      />
      </MenuBoundary>
      {toast !== null && <Toast text={toast} onDone={() => { setToast(null) }} />}
    </>
  )
}
