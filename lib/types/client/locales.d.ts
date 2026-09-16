/** Namespace this plugin owns. */
export declare const NS = "dsh.fileLinkMenu";
/** Simplified Chinese dictionary and key-set source of truth. */
export declare const zh: {
    readonly 'file.open': "打开文件";
    readonly 'file.openWith': "打开方式";
    readonly 'file.openInVscode': "在 VS Code 中打开";
    readonly 'file.saveAs': "另存为…";
    readonly 'file.copyPath': "复制文件路径";
    readonly 'file.revealFinder': "在访达中显示";
    readonly 'file.revealExplorer': "在文件资源管理器中显示";
    readonly 'file.revealDirectory': "打开所在文件夹";
    readonly 'link.openTab': "在新标签页中打开";
    readonly 'link.openExternal': "在外部浏览器中打开";
    readonly 'link.copy': "复制链接";
    readonly 'link.saveAs': "链接另存为…";
    readonly 'action.copied': "已复制到剪贴板";
    readonly 'action.saveStarted': "已开始下载";
    readonly 'action.saved': "已保存到 {path}";
    readonly 'action.saveCancelled': "已取消保存";
    readonly 'error.copy': "复制失败，请手动复制。";
    readonly 'error.open': "打开失败，请重试。";
    readonly 'error.reveal': "无法在文件管理器中显示。";
    readonly 'error.missing': "文件不存在或已被移动。";
    readonly 'error.outsideWorkspace': "该文件不在当前会话的工作区内，已拒绝操作。";
    readonly 'error.noWorkspace': "这个会话没有工作区目录。";
    readonly 'error.notAFile': "这是一个目录，不能另存为文件。";
    readonly 'error.tooLarge': "文件太大，无法另存。";
    readonly 'error.noDirectory': "目标目录不存在或不可写。";
    readonly 'error.saveFailed': "写入目标文件失败。";
    readonly 'error.unsupported': "当前平台不支持这个操作。";
    readonly 'error.unknownApp': "这个应用已不可用，请刷新页面。";
    readonly 'error.invalidUrl': "链接无效，只支持 http 和 https。";
    readonly 'error.privateAddress': "出于安全考虑，已拒绝访问内网地址。";
    readonly 'error.unresolvedHost': "无法解析该链接的域名。";
    readonly 'error.remote': "远端拒绝了下载请求。";
    readonly 'error.fetch': "链接下载失败，请重试。";
    readonly 'error.badRequest': "请求无效，请刷新页面后重试。";
    readonly 'error.unknownAttachment': "找不到这个附件，它可能已被移除。";
    readonly 'error.noAttachmentStore': "这个部署没有保存附件的目录。";
    readonly 'error.generic': "操作未完成，请重试。";
    readonly 'app.vscode': "VS Code";
    readonly 'app.vscodeinsiders': "VS Code Insiders";
    readonly 'app.cursor': "Cursor";
    readonly 'app.zed': "Zed";
    readonly 'app.windsurf': "Windsurf";
    readonly 'app.sublimetext': "Sublime Text";
    readonly 'app.xcode': "Xcode";
    readonly 'app.ghostty': "Ghostty";
    readonly 'app.iterm': "iTerm";
    readonly 'app.warp': "Warp";
    readonly 'app.kitty': "kitty";
    readonly 'app.terminal': "终端";
};
/** Dictionary key union. */
export type FileLinkMenuKey = keyof typeof zh;
/** English dictionary, checked against the Chinese key set. */
export declare const en: {
    'file.open': string;
    'file.openWith': string;
    'file.openInVscode': string;
    'file.saveAs': string;
    'file.copyPath': string;
    'file.revealFinder': string;
    'file.revealExplorer': string;
    'file.revealDirectory': string;
    'link.openTab': string;
    'link.openExternal': string;
    'link.copy': string;
    'link.saveAs': string;
    'action.copied': string;
    'action.saveStarted': string;
    'action.saved': string;
    'action.saveCancelled': string;
    'error.copy': string;
    'error.open': string;
    'error.reveal': string;
    'error.missing': string;
    'error.outsideWorkspace': string;
    'error.noWorkspace': string;
    'error.notAFile': string;
    'error.tooLarge': string;
    'error.noDirectory': string;
    'error.saveFailed': string;
    'error.unsupported': string;
    'error.unknownApp': string;
    'error.invalidUrl': string;
    'error.privateAddress': string;
    'error.unresolvedHost': string;
    'error.remote': string;
    'error.fetch': string;
    'error.badRequest': string;
    'error.unknownAttachment': string;
    'error.noAttachmentStore': string;
    'error.generic': string;
    'app.vscode': string;
    'app.vscodeinsiders': string;
    'app.cursor': string;
    'app.zed': string;
    'app.windsurf': string;
    'app.sublimetext': string;
    'app.xcode': string;
    'app.ghostty': string;
    'app.iterm': string;
    'app.warp': string;
    'app.kitty': string;
    'app.terminal': string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Right-click file and link menu copy. */
        'dsh.fileLinkMenu': FileLinkMenuKey;
    }
}
//# sourceMappingURL=locales.d.ts.map