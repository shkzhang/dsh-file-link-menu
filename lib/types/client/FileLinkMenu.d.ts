import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type FileLinkMenuController } from './controller.ts';
import { NS } from './locales.ts';
/** Business face injected into the composer's overlay contribution. */
export interface FileLinkMenuInjected {
    /**
     * The Session whose composer holds this entry, or an empty string when the
     * seat was injected without one. An attachment belongs to no Session, so the
     * attachment rows still work; only the workspace half of the Host's admitted
     * roots and the right-Sidebar preview need a named Session.
     */
    readonly sessionId: string;
    readonly controller: FileLinkMenuController;
    /**
     * Host directory chooser (`另存为` asks where to write first). Absent when
     * the composition has no workspace plugin; the row then falls back to the
     * browser's own attachment download.
     */
    readonly pickDirectory?: () => Promise<string | null>;
    /**
     * Show one file beside the conversation, through the composition's right
     * Sidebar. Absent when no such Sidebar is mounted, or when it refuses the
     * address; an attachment click then opens the file with the Host instead.
     * @param path - absolute path of the file to show.
     */
    readonly previewFile?: (path: string) => void;
}
/** Composed props of the header contribution. */
export type FileLinkMenuProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS> & InjectFace<FileLinkMenuInjected>;
/**
 * Render the right-click menu for files and links, and the attachment preview.
 * @param props - Session identity, the action controller, and the locale seat.
 * @returns the portaled menu, plus a transient toast for action feedback.
 */
export declare function FileLinkMenuSurface({ sessionId, controller, pickDirectory, previewFile, t }: FileLinkMenuProps): import("react").JSX.Element;
//# sourceMappingURL=FileLinkMenu.d.ts.map