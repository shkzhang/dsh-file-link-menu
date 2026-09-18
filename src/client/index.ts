/**
 * Browser half of dsh-file-link-menu: register the bilingual dictionaries, the
 * overlay contribution that owns the right-click menu, and the display layer
 * that re-dresses every path chip in the conversation.
 *
 * The overlay contribution renders no visible chrome; it is the lifecycle host
 * for the capture-phase `contextmenu` and `click` listeners, the portaled menu,
 * and the attachment preview, so the plugin gains both without claiming any
 * slot a feature already occupies. The display layer is installed on the same
 * axis: one effect, disposed with the plugin.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { FileLinkMenuController } from './controller.ts'
import { attachChipEnhancement } from './enhance.ts'
import { createIconFactory } from './icons.ts'
import { FileLinkMenuSurface, type FileLinkMenuInjected } from './FileLinkMenu.tsx'
import { en, NS, zh } from './locales.ts'
import { previewFileInSidebar, type SidebarRightService } from './preview.ts'
import './chips.module.css'

/** Required services for locale registration and the overlay contribution. */
export const inject = ['slots', 'locale']

/** Host directory chooser exposed by the workspace plugin, when it is mounted. */
interface DirectoryPickerService {
  pickDirectory(): Promise<string | null>
}

/**
 * Read one optional client service.
 *
 * `ctx.get` answers for services this plugin does not declare; the context
 * property proxy throws for those names instead. A context without `get`
 * (an older shell, a test double) falls back to a guarded property read, so a
 * missing optional service never turns into a failed client row.
 * @param ctx - client root context.
 * @param key - service name.
 * @returns the service object, or undefined when it is absent.
 */
function optionalService<T>(ctx: ClientContext, key: string): T | undefined {
  const reader = (ctx as { get?: (name: string) => unknown }).get
  if (typeof reader === 'function') {
    const value = reader.call(ctx, key)
    return typeof value === 'object' && value !== null ? value as T : undefined
  }
  try {
    const value: unknown = Reflect.get(ctx, key)
    return typeof value === 'object' && value !== null ? value as T : undefined
  } catch {
    return undefined
  }
}

export type { FileLinkMenuInjected, FileLinkMenuProps } from './FileLinkMenu.tsx'
export { FileLinkMenuController } from './controller.ts'

/**
 * Client plugin body: one dictionary effect and one list entry.
 *
 * A client row that throws while registering takes the rest of the client
 * composition with it, and every other plugin's UI disappears with no
 * explanation the user can act on. This plugin only adds a menu, so it fails
 * soft and loud on the console instead: the shell's own menus stay exactly as
 * they were.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  try {
    const controller = new FileLinkMenuController()
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-file-link-menu: dictionaries')
    // The display layer, on the plugin's own lifecycle axis: it stops watching
    // when the plugin unloads, and every chip it re-dressed keeps the rendering
    // the shell gives back on the next commit.
    ctx.effect(
      () => attachChipEnhancement(createIconFactory()).dispose,
      'dsh-file-link-menu: path chips',
    )
    // The composer's overlay anchor, not the Session header: the header is not
    // rendered while a Session has no messages yet, and that is exactly the
    // Session whose composer holds a freshly attached file. Both the menu and
    // the toast portal to the page, so nothing here is laid out or clipped.
    ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
      name: 'conversation.input.overlay',
      id: 'file-link-menu',
      // Among the composer's overlays the entry renders nothing visible, so its
      // order only decides where the invisible host sits.
      order: 1000,
      locale: NS,
      // Optional services are read here rather than in `apply`: the injection
      // runs once the client composition is up, while a row applied earlier
      // than the workspace or Sidebar plugin would still find it missing.
      inject: (sessionId?: string): FileLinkMenuInjected => {
        // A composition without the workspace plugin keeps the browser download.
        const picker = optionalService<DirectoryPickerService>(ctx, 'uiWorkspace')
        // Without the right Sidebar an attachment click opens the file instead.
        const sidebar = optionalService<SidebarRightService>(ctx, 'sidebarRight')
        return {
          sessionId: sessionId ?? '',
          controller,
          ...(picker === undefined ? {} : { pickDirectory: () => picker.pickDirectory() }),
          ...(sidebar === undefined ? {} : {
            previewFile: (path: string) => {
              if (sessionId === undefined || sessionId.length === 0) {
                throw new Error('no Session is on screen to preview in')
              }
              previewFileInSidebar(sidebar, sessionId, path)
            },
          }),
        }
      },
    }, FileLinkMenuSurface))
  } catch (error: unknown) {
    console.error('[dsh-file-link-menu] client registration failed; the built-in menus are untouched', error)
  }
}
