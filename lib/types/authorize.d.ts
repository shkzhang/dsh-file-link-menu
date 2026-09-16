/**
 * The roots one Session may act on, answered by the Host's Session services.
 *
 * Both are optional because neither is guaranteed: a Session may have no
 * workspace, and a composition may mount no host-file-backed attachment store.
 * A resolved path must land inside one of them.
 */
export interface AdmittedRoots {
    /**
     * Session workspace root. Relative paths resolve against it and only it, so
     * an unknown workspace refuses a relative path rather than resolving it
     * against the attachment store.
     */
    readonly workspace?: string;
    /** dsh's attachment store root, which sits outside every workspace. */
    readonly attachments?: string;
}
/** Root lookup for one Session, answered by the Host's Session services. */
export type RootResolver = (sessionId: string) => Promise<AdmittedRoots>;
/** A path the Host accepted, already resolved through symlinks. */
export interface AuthorizedPath {
    readonly path: string;
    readonly isDirectory: boolean;
    readonly size: number;
}
/** Why a requested path was refused; the status is the route's answer. */
export interface PathRefusal {
    readonly status: 400 | 403 | 404 | 409;
    readonly error: string;
}
/** Either the accepted path or the refusal the route must return. */
export type PathDecision = {
    readonly ok: true;
    readonly value: AuthorizedPath;
} | {
    readonly ok: false;
    readonly refusal: PathRefusal;
};
/**
 * Resolve and confine one requested path.
 * @param roots - the roots this Host admits for the Session; none when neither is known.
 * @param rawPath - path exactly as the browser sent it.
 * @returns the resolved file facts, or the refusal to answer with.
 */
export declare function authorizePath(roots: AdmittedRoots | undefined, rawPath: unknown): Promise<PathDecision>;
//# sourceMappingURL=authorize.d.ts.map