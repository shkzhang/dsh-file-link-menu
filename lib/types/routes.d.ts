import type { IncomingMessage, ServerResponse } from 'node:http';
import { type RootResolver } from './authorize.ts';
import { type ResolvedAttachment } from './attachments.ts';
/** One HTTP route, as `webServer.register` expects it. */
export interface RouteDefinition {
    readonly kind: 'exact';
    readonly path: string;
    readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void;
}
/** Trust surface consumed here; the browser-side connection package owns the full type. */
interface ConnectionService {
    requestRejection(request: {
        readonly headers: IncomingMessage['headers'];
    }): 401 | 403 | undefined;
}
/** What the routes need from the plugin body. */
export interface RouteDeps {
    readonly connection: ConnectionService;
    readonly resolveRoot: RootResolver;
    readonly warn: (message: string, error?: unknown) => void;
    /**
     * Resolve one attached file's display name to its stored path; undefined when
     * this composition has no host-file-backed attachment store.
     */
    readonly resolveAttachment?: (name: unknown) => Promise<ResolvedAttachment | undefined>;
    /** Launch seam; tests supply their own so no spec starts a real application. */
    readonly launch?: (argv: readonly string[]) => void;
}
/** Parent directory of a host path, slash- and backslash-aware. */
declare function parentOf(path: string): string;
/**
 * Build every route this plugin serves.
 * @param deps - trust fence, Session root lookup, attachment lookup, and the host logger.
 * @returns route definitions in registration order.
 */
export declare function buildRoutes(deps: RouteDeps): readonly RouteDefinition[];
export { parentOf };
//# sourceMappingURL=routes.d.ts.map