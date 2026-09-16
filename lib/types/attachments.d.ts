/** The attachment backend, narrowed to the root this module searches. */
export interface AttachmentStoreService {
    /**
     * Absolute versioned storage root, present only on a host-file-backed
     * backend. A backend without it has no path to hand any route.
     */
    readonly root?: string;
}
/** One stored attachment the lookup found. */
export interface ResolvedAttachment {
    /** Absolute path of the stored file, inside the store's `files` tree. */
    readonly path: string;
    /** Stored byte length. */
    readonly bytes: number;
}
/** Lookup dependencies: the backend, the host logger, and the clock. */
export interface AttachmentLookupDeps {
    readonly store: AttachmentStoreService | undefined;
    readonly warn: (message: string, error?: unknown) => void;
    /** Current time in milliseconds; a test supplies its own to expire the cache deterministically. */
    readonly now?: () => number;
}
/**
 * The store root this Host can search.
 * @param store - the composition's attachment backend, when it is mounted.
 * @returns the absolute store root, or undefined when this backend has none.
 */
export declare function attachmentStoreRoot(store: AttachmentStoreService | undefined): string | undefined;
/**
 * Whether one string can be a stored attachment leaf name.
 *
 * The name arrives on a DOM `title`, so it is browser input: a separator would
 * let a card name a file outside the searched directory, `..` would step out of
 * it, and a control character has no place in a display name the store
 * sanitized. The store itself maps an empty or dot-only name to `file`, so
 * neither is a name it could have written.
 * @param value - candidate name.
 * @returns true when the name is a single safe path segment.
 */
export declare function attachmentNameIsSafe(value: unknown): value is string;
/**
 * Build the name lookup the attachment route calls.
 * @param deps - the attachment backend, the host logger, and the clock.
 * @returns a lookup that answers one stored attachment by display name.
 */
export declare function createAttachmentLookup(deps: AttachmentLookupDeps): (name: unknown) => Promise<ResolvedAttachment | undefined>;
//# sourceMappingURL=attachments.d.ts.map