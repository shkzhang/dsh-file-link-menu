import type { CapsFileManager, CapsPlatform } from './shared.ts';
/** Node's platform narrowed to what this plugin distinguishes. */
export declare function platformOf(): CapsPlatform;
/**
 * Probe which applications this Host can actually launch.
 * @param platform - narrowed host platform.
 * @returns launchable application ids in menu order.
 */
export declare function probeApps(platform: CapsPlatform): Promise<readonly string[]>;
/** The Host file manager flavour, or null when the host has none. */
export declare function fileManagerOf(platform: CapsPlatform): Promise<CapsFileManager>;
/** Whether this Host has a desktop session at all. */
export declare function desktopAvailable(platform: CapsPlatform, fileManager: CapsFileManager): Promise<boolean>;
/**
 * Command opening one path with the OS default application.
 * @param path - absolute path accepted by `authorizePath`.
 * @param platform - narrowed host platform.
 * @returns argv, or undefined when this platform has no opener.
 */
export declare function defaultOpenArgv(path: string, platform: CapsPlatform): readonly string[] | undefined;
/**
 * Command selecting one path in the Host file manager.
 * @param path - absolute path accepted by `authorizePath`.
 * @param isDirectory - whether the path is a directory, which some managers open instead of selecting.
 * @param platform - narrowed host platform.
 * @returns argv, or undefined when this platform has no file manager.
 */
export declare function revealArgv(path: string, isDirectory: boolean, platform: CapsPlatform): readonly string[] | undefined;
/**
 * Command handing one URL to the OS default browser.
 * @param url - validated http(s) URL.
 * @param platform - narrowed host platform.
 * @returns argv, or undefined when this platform has no browser hand-off.
 */
export declare function urlArgv(url: string, platform: CapsPlatform): readonly string[] | undefined;
/**
 * Command opening one path with a probed application.
 * @param appId - id from {@link probeApps}.
 * @param path - absolute path accepted by `authorizePath`.
 * @param isDirectory - whether the path is a directory.
 * @param platform - narrowed host platform.
 * @returns argv, or undefined for an id this plugin cannot launch.
 */
export declare function appArgv(appId: string, path: string, isDirectory: boolean, platform: CapsPlatform): readonly string[] | undefined;
//# sourceMappingURL=openers.d.ts.map