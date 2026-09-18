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
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import './chips.module.css';
/** Required services for locale registration and the overlay contribution. */
export declare const inject: string[];
export type { FileLinkMenuInjected, FileLinkMenuProps } from './FileLinkMenu.tsx';
export { FileLinkMenuController } from './controller.ts';
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
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map