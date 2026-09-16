/**
 * Browser side of the menu actions: Host capability read, the file and link
 * routes, and the two pure-browser actions (`复制文件路径` / `复制链接` and the
 * new-tab hand-off) that need no Host round trip.
 */
import { type CapsPayload } from '../shared.ts';
/** One action failure carrying the Host's stable code. */
export declare class MenuActionError extends Error {
    readonly code: string;
    /**
     * @param code - stable failure code from the Host, or a browser-side code.
     */
    constructor(code: string);
}
/** Plugin-owned action surface for the menu component. */
export declare class FileLinkMenuController {
    private caps;
    private loading;
    /** Capabilities already read, for the first render after a page cache. */
    get known(): CapsPayload | null;
    /** Read Host capabilities once per page; a failed read hides every Host row. */
    loadCaps(): Promise<CapsPayload | null>;
    private readCaps;
    /** Open one Session file with the default application. */
    open(sessionId: string, path: string): Promise<void>;
    /**
     * Resolve one attached file's display name to the path the Host stored it at.
     *
     * An attachment card carries the name only, so every action that needs a path
     * starts here; the answer's path is inside the Host's attachment store, which
     * the Host's own routes admit as a second root.
     * @param name - display name the attachment card carried.
     * @returns the stored path and byte length.
     */
    attachmentPath(name: string): Promise<{
        path: string;
        bytes: number;
    }>;
    /** Select one Session file in the Host file manager. */
    reveal(sessionId: string, path: string): Promise<void>;
    /** Open one Session file with one probed application. */
    openWith(sessionId: string, path: string, app: string): Promise<void>;
    /** Hand one external URL to the Host's default browser. */
    openUrl(url: string): Promise<void>;
    /**
     * Copy one Session file into a directory the user chose.
     * @param sessionId - Session that declared the file.
     * @param path - path as the menu read it off the DOM.
     * @param directory - absolute destination directory from the Host picker.
     * @returns the path the Host wrote.
     */
    saveAs(sessionId: string, path: string, directory: string): Promise<string>;
    /**
     * Write one remote URL into a directory the user chose.
     * @param url - validated http(s) URL.
     * @param directory - absolute destination directory from the Host picker.
     * @returns the path the Host wrote.
     */
    saveLinkAs(url: string, directory: string): Promise<string>;
    /** Read the written path out of one save answer. */
    private savedPath;
    /** Start a browser download of one Session file. */
    download(sessionId: string, path: string): void;
    /** Start a browser download of one remote URL. */
    downloadLink(url: string): void;
    /** Copy one string to the clipboard, with a selection fallback for insecure origins. */
    copyText(text: string): Promise<void>;
    private mutate;
    /**
     * Start one attachment download without navigating the app away.
     *
     * A direct anchor or location change makes the browser leave the Harness
     * page whenever the Host answers with anything but an attachment (a refusal,
     * for instance), which loses the whole conversation view. A hidden frame
     * takes that navigation instead, so a failed download is invisible here and
     * the Host's `Content-Disposition` still drives the shell's own save flow.
     */
    private triggerDownload;
}
//# sourceMappingURL=controller.d.ts.map