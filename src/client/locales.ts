/**
 * `dsh.fileLinkMenu` namespace dictionaries.
 *
 * Row labels follow the Host's own file-manager flavour, so a Windows Host
 * says "Show in File Explorer" where macOS says "Reveal in Finder".
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Namespace this plugin owns. */
export const NS = 'dsh.fileLinkMenu'

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'file.open': '打开文件',
  'file.openWith': '打开方式',
  'file.openInVscode': '在 VS Code 中打开',
  'file.saveAs': '另存为…',
  'file.copyPath': '复制文件路径',
  'file.revealFinder': '在访达中显示',
  'file.revealExplorer': '在文件资源管理器中显示',
  'file.revealDirectory': '打开所在文件夹',
  'link.openTab': '在新标签页中打开',
  'link.openExternal': '在外部浏览器中打开',
  'link.copy': '复制链接',
  'link.saveAs': '链接另存为…',
  'action.copied': '已复制到剪贴板',
  'action.saveStarted': '已开始下载',
  'action.saved': '已保存到 {path}',
  'action.saveCancelled': '已取消保存',
  'error.copy': '复制失败，请手动复制。',
  'error.open': '打开失败，请重试。',
  'error.reveal': '无法在文件管理器中显示。',
  'error.missing': '文件不存在或已被移动。',
  'error.outsideWorkspace': '该文件不在当前会话的工作区内，已拒绝操作。',
  'error.noWorkspace': '这个会话没有工作区目录。',
  'error.notAFile': '这是一个目录，不能另存为文件。',
  'error.tooLarge': '文件太大，无法另存。',
  'error.noDirectory': '目标目录不存在或不可写。',
  'error.saveFailed': '写入目标文件失败。',
  'error.unsupported': '当前平台不支持这个操作。',
  'error.unknownApp': '这个应用已不可用，请刷新页面。',
  'error.invalidUrl': '链接无效，只支持 http 和 https。',
  'error.privateAddress': '出于安全考虑，已拒绝访问内网地址。',
  'error.unresolvedHost': '无法解析该链接的域名。',
  'error.remote': '远端拒绝了下载请求。',
  'error.fetch': '链接下载失败，请重试。',
  'error.badRequest': '请求无效，请刷新页面后重试。',
  'error.unknownAttachment': '找不到这个附件，它可能已被移除。',
  'error.noAttachmentStore': '这个部署没有保存附件的目录。',
  'error.generic': '操作未完成，请重试。',
  'app.vscode': 'VS Code',
  'app.vscodeinsiders': 'VS Code Insiders',
  'app.cursor': 'Cursor',
  'app.zed': 'Zed',
  'app.windsurf': 'Windsurf',
  'app.sublimetext': 'Sublime Text',
  'app.xcode': 'Xcode',
  'app.ghostty': 'Ghostty',
  'app.iterm': 'iTerm',
  'app.warp': 'Warp',
  'app.kitty': 'kitty',
  'app.terminal': '终端',
} as const

/** Dictionary key union. */
export type FileLinkMenuKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'file.open': 'Open file',
  'file.openWith': 'Open with',
  'file.openInVscode': 'Open in VS Code',
  'file.saveAs': 'Save as…',
  'file.copyPath': 'Copy file path',
  'file.revealFinder': 'Reveal in Finder',
  'file.revealExplorer': 'Show in File Explorer',
  'file.revealDirectory': 'Open containing folder',
  'link.openTab': 'Open in new tab',
  'link.openExternal': 'Open in default browser',
  'link.copy': 'Copy link',
  'link.saveAs': 'Save link as…',
  'action.copied': 'Copied to clipboard',
  'action.saveStarted': 'Download started',
  'action.saved': 'Saved to {path}',
  'action.saveCancelled': 'Save cancelled',
  'error.copy': 'Copy failed. Copy it manually.',
  'error.open': 'Could not open the file. Try again.',
  'error.reveal': 'Could not show the file in the file manager.',
  'error.missing': 'The file is gone or was moved.',
  'error.outsideWorkspace': 'That file is outside this Session workspace, so the action was refused.',
  'error.noWorkspace': 'This Session has no workspace directory.',
  'error.notAFile': 'That is a directory, not a file to save.',
  'error.tooLarge': 'The file is too large to save.',
  'error.noDirectory': 'The destination directory does not exist or is not writable.',
  'error.saveFailed': 'Could not write the destination file.',
  'error.unsupported': 'This platform does not support the action.',
  'error.unknownApp': 'That application is no longer available. Refresh the page.',
  'error.invalidUrl': 'Invalid link. Only http and https are supported.',
  'error.privateAddress': 'Refused: private network addresses are not allowed.',
  'error.unresolvedHost': 'The link host name could not be resolved.',
  'error.remote': 'The remote host refused the download.',
  'error.fetch': 'The link download failed. Try again.',
  'error.badRequest': 'Invalid request. Refresh the page and try again.',
  'error.unknownAttachment': 'That attachment could not be found; it may have been removed.',
  'error.noAttachmentStore': 'This deployment has no attachment store.',
  'error.generic': 'The action did not complete. Try again.',
  'app.vscode': 'VS Code',
  'app.vscodeinsiders': 'VS Code Insiders',
  'app.cursor': 'Cursor',
  'app.zed': 'Zed',
  'app.windsurf': 'Windsurf',
  'app.sublimetext': 'Sublime Text',
  'app.xcode': 'Xcode',
  'app.ghostty': 'Ghostty',
  'app.iterm': 'iTerm',
  'app.warp': 'Warp',
  'app.kitty': 'kitty',
  'app.terminal': 'Terminal',
} satisfies Record<FileLinkMenuKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Right-click file and link menu copy. */
    'dsh.fileLinkMenu': FileLinkMenuKey
  }
}
