/**
 * Host half of dsh-file-link-menu.
 *
 * It owns the file and link actions the browser menu triggers: launch the
 * default application, select a file in the Host file manager, launch one
 * probed application, stream a Session file as an attachment, hand a URL to
 * the default browser, and stream a remote URL as an attachment. It also turns
 * an attached file's display name back into the stored path its card cannot
 * carry. The browser never sees a Host path it can act on without this half
 * verifying it first.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis function-plugin name. */
export declare const name = "dsh-file-link-menu";
/** The route carrier and the trust fence guarding every route. */
export declare const inject: string[];
/**
 * Plugin body: register every route on the composition's web server.
 * @param ctx - host root context carrying `webServer` and `connection`.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map