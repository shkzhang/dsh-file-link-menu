/**
 * The right-Sidebar preview one attachment click opens.
 *
 * The Sidebar's file tab reads an absolute path through the composed
 * filesystem, so a stored attachment renders there even though the store sits
 * outside the Session workspace. The type is named explicitly: a composition
 * may register a workspace-fenced editor for the same address, and that editor
 * would refuse a file the Session's workspace does not contain.
 */

/** The right Sidebar as far as this plugin uses it (`ctx.sidebarRight`). */
export interface SidebarRightService {
  /**
   * Open a resource: claim it, place it, reveal the column, record the navigation.
   * @param address - a `dsh-resource://file/…` address.
   * @param options - the opening type; its `canOpen` still applies.
   */
  openResource(address: string, options?: { readonly kind?: string }): void
}

/** The shell's own text tab, which renders any file extension it knows. */
const TEXT_PREVIEW_KIND = 'text'

/** The scheme and type every file address opens with. */
const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

/**
 * Component-encode one address segment, keeping `:` literal for drive letters.
 * @param segment - one id or path segment.
 * @returns the encoded segment.
 */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/giu, ':')
}

/**
 * Build the address of one Session file.
 *
 * The grammar is the one the Sidebar and its file type share: a
 * `session`-scoped address names the Session whose Host resolves the path, and
 * each path segment is component-encoded so a name carrying `#`, `?`, or a
 * space survives the round trip. An absolute path keeps its empty first
 * segment, which is how the Sidebar reads it back as absolute.
 * @param sessionId - Session the file is shown under.
 * @param path - absolute path of the file.
 * @returns the `dsh-resource://file/session/<sessionId>/<path>` address.
 */
export function sessionFileAddress(sessionId: string, path: string): string {
  const segments = path.replace(/\\/gu, '/').split('/').map(encodeSegment).join('/')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${segments}`
}

/**
 * Show one file beside the conversation.
 * @param sidebar - the composed right Sidebar.
 * @param sessionId - Session the file is shown under.
 * @param path - absolute path of the file.
 */
export function previewFileInSidebar(sidebar: SidebarRightService, sessionId: string, path: string): void {
  sidebar.openResource(sessionFileAddress(sessionId, path), { kind: TEXT_PREVIEW_KIND })
}
