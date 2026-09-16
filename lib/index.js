// src/attachments.ts
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
var SHARD_NAME = /^[0-9a-f]{2}$/u;
var OBJECT_NAME = /^[0-9a-f]{64}$/u;
var UNSAFE_NAME = /[\u0000-\u001f\u007f/\\]/u;
var MAX_NAME_BYTES = 255;
var MAX_OBJECTS = 2e4;
var CACHE_TTL_MS = 5e3;
function attachmentStoreRoot(store) {
  const root = store?.root;
  return typeof root === "string" && root.length > 0 ? root : void 0;
}
function attachmentNameIsSafe(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value === "." || value === "..") return false;
  if (UNSAFE_NAME.test(value)) return false;
  return Buffer.byteLength(value) <= MAX_NAME_BYTES;
}
async function search(store, name2, warn) {
  const files = join(store, "files");
  let shards;
  try {
    shards = await readdir(files, { withFileTypes: true });
  } catch (error) {
    warn(`attachment store is not readable at ${files}`, error);
    return [];
  }
  const found = [];
  let visited = 0;
  for (const shard of shards) {
    if (!shard.isDirectory() || !SHARD_NAME.test(shard.name)) continue;
    const directory = join(files, shard.name);
    const objects = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const object of objects) {
      if (!object.isDirectory() || !OBJECT_NAME.test(object.name)) continue;
      if (visited >= MAX_OBJECTS) return newestFirst(found);
      visited += 1;
      const candidate = join(directory, object.name, name2);
      const info = await stat(candidate).catch(() => void 0);
      if (info?.isFile() === true) found.push({ path: candidate, bytes: info.size, mtimeMs: info.mtimeMs });
    }
  }
  return newestFirst(found);
}
function newestFirst(found) {
  return [...found].sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
}
function createAttachmentLookup(deps) {
  const store = attachmentStoreRoot(deps.store);
  const now = deps.now ?? Date.now;
  const cache = /* @__PURE__ */ new Map();
  return async (name2) => {
    if (!attachmentNameIsSafe(name2)) return void 0;
    if (store === void 0) return void 0;
    const hit = cache.get(name2);
    const at = now();
    if (hit !== void 0 && at - hit.at < CACHE_TTL_MS) return hit.found;
    const [best] = await search(store, name2, deps.warn);
    const found = best === void 0 ? void 0 : { path: best.path, bytes: best.bytes };
    cache.set(name2, { at, found });
    return found;
  };
}

// src/routes.ts
import { createReadStream, createWriteStream } from "node:fs";
import { access as access2, copyFile, realpath as realpath2, stat as stat3, unlink } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { basename, isAbsolute as isAbsolute2, join as join3, parse } from "node:path";
import { spawn } from "node:child_process";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// src/authorize.ts
import { realpath, stat as stat2 } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
var URL_LIKE = /^[a-z][a-z\d+.-]*:/iu;
function localPathOf(value) {
  try {
    return fileURLToPath(value);
  } catch {
    return void 0;
  }
}
async function realRoot(root) {
  if (root === void 0 || root.length === 0) return void 0;
  try {
    return await realpath(root);
  } catch {
    return void 0;
  }
}
async function authorizePath(roots, rawPath) {
  if (typeof rawPath !== "string" || rawPath.length === 0 || rawPath.includes("\0")) {
    return { ok: false, refusal: { status: 400, error: "invalid-path" } };
  }
  const requested = rawPath.startsWith("file:") ? localPathOf(rawPath) : rawPath;
  if (requested === void 0 || URL_LIKE.test(requested)) {
    return { ok: false, refusal: { status: 400, error: "invalid-path" } };
  }
  const workspace = await realRoot(roots?.workspace);
  const admitted = [workspace, await realRoot(roots?.attachments)].filter((root) => root !== void 0);
  if (admitted.length === 0) return { ok: false, refusal: { status: 409, error: "no-workspace" } };
  const candidate = isAbsolute(requested) ? requested : workspace === void 0 ? void 0 : resolve(workspace, requested);
  if (candidate === void 0) return { ok: false, refusal: { status: 409, error: "no-workspace" } };
  let real;
  let info;
  try {
    real = await realpath(candidate);
    info = await stat2(real);
  } catch {
    return { ok: false, refusal: { status: 404, error: "missing" } };
  }
  const inside = admitted.some((root) => real === root || real.startsWith(root + sep));
  if (!inside) return { ok: false, refusal: { status: 403, error: "outside-workspace" } };
  return { ok: true, value: { path: real, isDirectory: info.isDirectory(), size: info.size } };
}

// src/openers.ts
import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join as join2 } from "node:path";
function platformOf() {
  const value = process.platform;
  return value === "darwin" || value === "win32" || value === "linux" ? value : "other";
}
var APPS = [
  { id: "vscode", macBundle: "Visual Studio Code.app", macApp: "Visual Studio Code", cli: "code" },
  { id: "vscodeinsiders", macBundle: "Visual Studio Code - Insiders.app", macApp: "Visual Studio Code - Insiders", cli: "code-insiders" },
  { id: "cursor", macBundle: "Cursor.app", macApp: "Cursor", cli: "cursor" },
  { id: "zed", macBundle: "Zed.app", macApp: "Zed", cli: "zed" },
  { id: "windsurf", macBundle: "Windsurf.app", macApp: "Windsurf", cli: "windsurf" },
  { id: "sublimetext", macBundle: "Sublime Text.app", macApp: "Sublime Text", cli: "subl" },
  { id: "xcode", macBundle: "Xcode.app", macApp: "Xcode" },
  { id: "ghostty", macBundle: "Ghostty.app", macApp: "Ghostty", cli: "ghostty", directory: true },
  { id: "iterm", macBundle: "iTerm.app", macApp: "iTerm", directory: true },
  { id: "warp", macBundle: "Warp.app", macApp: "Warp", directory: true },
  { id: "kitty", cli: "kitty", cliArgs: ["--working-directory"], directory: true },
  { id: "terminal", macBundle: "Terminal.app", macDir: "/System/Applications/Utilities", macApp: "Terminal", cli: "gnome-terminal", cliArgs: ["--working-directory"], directory: true }
];
function macApplicationDirs() {
  return ["/Applications", "/System/Applications", "/System/Applications/Utilities", join2(homedir(), "Applications")];
}
async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function findOnPath(cli) {
  const path = process.env.PATH ?? "";
  const suffixes = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
  for (const dir of path.split(delimiter)) {
    if (dir.length === 0) continue;
    for (const suffix of suffixes) {
      if (await exists(join2(dir, cli + suffix))) return true;
    }
  }
  return false;
}
async function probeApps(platform) {
  const found = [];
  for (const app of APPS) {
    if (platform === "darwin") {
      if (app.macBundle === void 0) continue;
      const dirs = app.macDir === void 0 ? macApplicationDirs() : [app.macDir];
      for (const dir of dirs) {
        if (await exists(join2(dir, app.macBundle))) {
          found.push(app.id);
          break;
        }
      }
      continue;
    }
    if (app.cli === void 0) continue;
    if (await findOnPath(app.cli)) found.push(app.id);
  }
  return found;
}
async function fileManagerOf(platform) {
  if (platform === "darwin") return "finder";
  if (platform === "win32") return "explorer";
  if (platform === "linux") return await findOnPath("xdg-open") ? "directory" : null;
  return null;
}
async function desktopAvailable(platform, fileManager) {
  if (platform === "darwin" || platform === "win32") return true;
  return fileManager !== null;
}
function defaultOpenArgv(path, platform) {
  if (platform === "darwin") return ["open", path];
  if (platform === "win32") return ["cmd", "/c", "start", "", path];
  if (platform === "linux") return ["xdg-open", path];
  return void 0;
}
function revealArgv(path, isDirectory, platform) {
  if (platform === "darwin") return isDirectory ? ["open", path] : ["open", "-R", path];
  if (platform === "win32") return ["explorer", `/select,${path}`];
  if (platform === "linux") return ["xdg-open", isDirectory ? path : join2(path, "..")];
  return void 0;
}
function urlArgv(url, platform) {
  if (platform === "darwin") return ["open", url];
  if (platform === "win32") return ["cmd", "/c", "start", "", url];
  if (platform === "linux") return ["xdg-open", url];
  return void 0;
}
function appArgv(appId, path, isDirectory, platform) {
  const app = APPS.find((candidate) => candidate.id === appId);
  if (app === void 0) return void 0;
  const target = app.directory === true ? isDirectory ? path : dirnameOf(path) : path;
  if (platform === "darwin") {
    if (app.macApp === void 0) return void 0;
    return ["open", "-a", app.macApp, target];
  }
  if (app.cli === void 0) return void 0;
  return [app.cli, ...app.cliArgs ?? [], target];
}
function dirnameOf(path) {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? path : path.slice(0, index);
}

// src/shared.ts
var ROUTE_PREFIX = "/api/dsh-file-link-menu";
var CAPS_ROUTE = `${ROUTE_PREFIX}/caps`;
var OPEN_ROUTE = `${ROUTE_PREFIX}/open`;
var REVEAL_ROUTE = `${ROUTE_PREFIX}/reveal`;
var OPEN_WITH_ROUTE = `${ROUTE_PREFIX}/open-with`;
var DOWNLOAD_ROUTE = `${ROUTE_PREFIX}/download`;
var OPEN_URL_ROUTE = `${ROUTE_PREFIX}/open-url`;
var DOWNLOAD_LINK_ROUTE = `${ROUTE_PREFIX}/download-link`;
var ATTACHMENT_ROUTE = `${ROUTE_PREFIX}/attachment`;
var SAVE_AS_ROUTE = `${ROUTE_PREFIX}/save-as`;
var SAVE_LINK_AS_ROUTE = `${ROUTE_PREFIX}/save-link-as`;
var MAX_BODY_BYTES = 64 * 1024;
var MAX_FILE_BYTES = 512 * 1024 * 1024;
var MAX_LINK_BYTES = 256 * 1024 * 1024;
var LINK_TIMEOUT_MS = 3e4;
var LINK_REDIRECT_LIMIT = 3;

// src/routes.ts
function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(payload));
}
function sendMethodNotAllowed(response, allow) {
  response.statusCode = 405;
  response.setHeader("allow", allow);
  response.end();
}
function sendFailure(response, status, error) {
  sendJson(response, status, { ok: false, error });
}
async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return void 0;
    chunks.push(buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function launch(argv, warn) {
  const [command, ...args] = argv;
  if (command === void 0) return;
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", (error) => {
    warn(`launch failed: ${command}`, error);
  });
  child.unref();
}
function dispositionFor(name2) {
  const ascii = name2.replace(/[^\x20-\x7e]/gu, "_").replace(/["\\]/gu, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name2)}`;
}
function isPrivateAddress(address) {
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized);
    return mapped?.[1] === void 0 ? false : isPrivateAddress(mapped[1]);
  }
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a = 0, b = 0] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}
async function checkedRemoteUrl(raw, use) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) return { ok: false, error: "invalid-url" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "invalid-url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "invalid-url" };
  if (use === "hand-off") return { ok: true, url };
  const host = url.hostname.replace(/^\[|\]$/gu, "");
  if (isIP(host) !== 0) return isPrivateAddress(host) ? { ok: false, error: "private-address" } : { ok: true, url };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "private-address" };
  }
  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
      return { ok: false, error: "private-address" };
    }
  } catch {
    return { ok: false, error: "unresolved-host" };
  }
  return { ok: true, url };
}
async function streamRemote(body, response, cap) {
  if (body === null) {
    response.statusCode = 502;
    response.end();
    return false;
  }
  let written = 0;
  for await (const chunk of Readable.fromWeb(body)) {
    const buffer = chunk;
    written += buffer.length;
    if (written > cap) {
      response.destroy();
      return false;
    }
    if (!response.write(buffer)) await new Promise((resolve2) => {
      response.once("drain", resolve2);
    });
  }
  response.end();
  return true;
}
async function followRemote(start, signal) {
  let current = start;
  for (let hop = 0; hop <= LINK_REDIRECT_LIMIT; hop += 1) {
    const checked = await checkedRemoteUrl(current.toString(), "fetch");
    if (!checked.ok) return checked;
    const response = await fetch(checked.url, { redirect: "manual", signal, headers: { accept: "*/*" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null || location.length === 0) return { ok: false, error: "bad-response" };
      await response.body?.cancel();
      try {
        current = new URL(location, checked.url);
      } catch {
        return { ok: false, error: "invalid-url" };
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, error: `remote-${String(response.status)}` };
    }
    return { ok: true, response };
  }
  return { ok: false, error: "too-many-redirects" };
}
var SaveRefusal = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
    this.name = "SaveRefusal";
  }
};
var SCHEME_LIKE = /^[a-z][a-z\d+.-]*:/iu;
async function safeDirectory(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return void 0;
  if (SCHEME_LIKE.test(value) || !isAbsolute2(value)) return void 0;
  try {
    const real = await realpath2(value);
    return (await stat3(real)).isDirectory() ? real : void 0;
  } catch {
    return void 0;
  }
}
async function uniqueDestination(directory, name2) {
  const { name: stem, ext } = parse(name2);
  for (let index = 0; index < 1e3; index += 1) {
    const candidate = join3(directory, index === 0 ? name2 : `${stem} (${String(index)})${ext}`);
    try {
      await access2(candidate);
    } catch {
      return candidate;
    }
  }
  throw new SaveRefusal(500, "save-failed");
}
async function copyInto(directory, source, name2, cap) {
  if ((await stat3(source)).size > cap) throw new SaveRefusal(413, "too-large");
  const destination = await uniqueDestination(directory, name2);
  await copyFile(source, destination);
  return destination;
}
async function writeRemote(body, destination, cap) {
  if (body === null) throw new SaveRefusal(502, "bad-response");
  const sink = createWriteStream(destination);
  let written = 0;
  try {
    for await (const chunk of Readable.fromWeb(body)) {
      const buffer = chunk;
      written += buffer.length;
      if (written > cap) throw new SaveRefusal(413, "too-large");
      if (!sink.write(buffer)) await new Promise((resolve2) => {
        sink.once("drain", resolve2);
      });
    }
    await new Promise((resolve2, reject) => {
      sink.end(() => {
        resolve2();
      });
      sink.once("error", reject);
    });
  } catch (error) {
    sink.destroy();
    await unlink(destination).catch(() => void 0);
    throw error;
  }
}
function buildRoutes(deps) {
  const { connection, resolveRoot, resolveAttachment, warn } = deps;
  const run = deps.launch ?? ((argv) => {
    launch(argv, warn);
  });
  const platform = platformOf();
  const rejected = (request, response) => {
    const rejection = connection.requestRejection(request);
    if (rejection === void 0) return false;
    response.statusCode = rejection;
    response.end();
    return true;
  };
  const resolved = async (response, sessionId, path) => {
    const roots = await resolveRoot(typeof sessionId === "string" ? sessionId : "");
    const decision = await authorizePath(roots, path);
    if (!decision.ok) {
      sendFailure(response, decision.refusal.status, decision.refusal.error);
      return void 0;
    }
    return decision.value;
  };
  const guarded = (inner) => async (request, response) => {
    try {
      await inner(request, response);
    } catch (error) {
      console.error("[dsh-file-link-menu] route failed", error);
      warn("route failed", error);
      if (response.headersSent) response.destroy();
      else sendFailure(response, 500, "internal");
    }
  };
  return [
    {
      kind: "exact",
      path: CAPS_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "GET") {
          sendMethodNotAllowed(response, "GET");
          return;
        }
        const fileManager = await fileManagerOf(platform);
        const desktop = await desktopAvailable(platform, fileManager);
        const payload = {
          platform,
          fileManager,
          desktop,
          apps: desktop ? await probeApps(platform) : [],
          openUrl: urlArgv("https://example.invalid/", platform) !== void 0,
          saveAs: desktop,
          saveLink: platform !== "other"
        };
        sendJson(response, 200, payload);
      })
    },
    {
      kind: "exact",
      path: ATTACHMENT_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "POST") {
          sendMethodNotAllowed(response, "POST");
          return;
        }
        const body = await readJsonBody(request);
        if (body === void 0) {
          sendFailure(response, 400, "bad-request");
          return;
        }
        if (resolveAttachment === void 0) {
          sendFailure(response, 409, "no-attachment-store");
          return;
        }
        if (!attachmentNameIsSafe(body.name)) {
          sendFailure(response, 400, "unknown-attachment");
          return;
        }
        const found = await resolveAttachment(body.name);
        if (found === void 0) {
          sendFailure(response, 404, "unknown-attachment");
          return;
        }
        sendJson(response, 200, { ok: true, path: found.path, bytes: found.bytes });
      })
    },
    {
      kind: "exact",
      path: OPEN_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "POST") {
          sendMethodNotAllowed(response, "POST");
          return;
        }
        const body = await readJsonBody(request);
        if (body === void 0) {
          sendFailure(response, 400, "bad-request");
          return;
        }
        const target = await resolved(response, body.sessionId, body.path);
        if (target === void 0) return;
        const argv = defaultOpenArgv(target.path, platform);
        if (argv === void 0) {
          sendFailure(response, 501, "unsupported-platform");
          return;
        }
        run(argv);
        sendJson(response, 200, { ok: true });
      })
    },
    {
      kind: "exact",
      path: REVEAL_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "POST") {
          sendMethodNotAllowed(response, "POST");
          return;
        }
        const body = await readJsonBody(request);
        if (body === void 0) {
          sendFailure(response, 400, "bad-request");
          return;
        }
        const target = await resolved(response, body.sessionId, body.path);
        if (target === void 0) return;
        const argv = revealArgv(target.path, target.isDirectory, platform);
        if (argv === void 0) {
          sendFailure(response, 501, "unsupported-platform");
          return;
        }
        run(argv);
        sendJson(response, 200, { ok: true });
      })
    },
    {
      kind: "exact",
      path: OPEN_WITH_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "POST") {
          sendMethodNotAllowed(response, "POST");
          return;
        }
        const body = await readJsonBody(request);
        if (body === void 0) {
          sendFailure(response, 400, "bad-request");
          return;
        }
        const target = await resolved(response, body.sessionId, body.path);
        if (target === void 0) return;
        const appId = body.app;
        if (typeof appId !== "string") {
          sendFailure(response, 400, "unknown-app");
          return;
        }
        const available = await probeApps(platform);
        if (!available.includes(appId)) {
          sendFailure(response, 400, "unknown-app");
          return;
        }
        const argv = appArgv(appId, target.path, target.isDirectory, platform);
        if (argv === void 0) {
          sendFailure(response, 400, "unknown-app");
          return;
        }
        run(argv);
        sendJson(response, 200, { ok: true });
      })
    },
    {
      kind: "exact",
      path: DOWNLOAD_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "GET") {
          sendMethodNotAllowed(response, "GET");
          return;
        }
        const query = new URL(request.url ?? "/", "http://localhost").searchParams;
        const target = await resolved(response, query.get("sessionId"), query.get("path"));
        if (target === void 0) return;
        if (target.isDirectory) {
          sendFailure(response, 400, "not-a-file");
          return;
        }
        if (target.size > MAX_FILE_BYTES) {
          sendFailure(response, 413, "too-large");
          return;
        }
        response.statusCode = 200;
        response.setHeader("content-type", "application/octet-stream");
        response.setHeader("content-length", String(target.size));
        response.setHeader("content-disposition", dispositionFor(basename(target.path)));
        response.setHeader("cache-control", "no-store");
        await pipeline(createReadStream(target.path), response);
      })
    },
    {
      kind: "exact",
      path: OPEN_URL_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "POST") {
          sendMethodNotAllowed(response, "POST");
          return;
        }
        const body = await readJsonBody(request);
        if (body === void 0) {
          sendFailure(response, 400, "bad-request");
          return;
        }
        const checked = await checkedRemoteUrl(body.url, "hand-off");
        if (!checked.ok) {
          sendFailure(response, 400, checked.error);
          return;
        }
        const argv = urlArgv(checked.url.toString(), platform);
        if (argv === void 0) {
          sendFailure(response, 501, "unsupported-platform");
          return;
        }
        run(argv);
        sendJson(response, 200, { ok: true });
      })
    },
    {
      kind: "exact",
      path: DOWNLOAD_LINK_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "GET") {
          sendMethodNotAllowed(response, "GET");
          return;
        }
        const query = new URL(request.url ?? "/", "http://localhost").searchParams;
        const checked = await checkedRemoteUrl(query.get("url"), "fetch");
        if (!checked.ok) {
          sendFailure(response, 400, checked.error);
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, LINK_TIMEOUT_MS);
        try {
          const remote = await followRemote(checked.url, controller.signal);
          if (!remote.ok) {
            sendFailure(response, 502, remote.error);
            return;
          }
          const declared = Number(remote.response.headers.get("content-length") ?? "0");
          if (Number.isFinite(declared) && declared > MAX_LINK_BYTES) {
            await remote.response.body?.cancel();
            sendFailure(response, 413, "too-large");
            return;
          }
          const name2 = basename(new URL(remote.response.url === "" ? checked.url.toString() : remote.response.url).pathname) || "download";
          response.statusCode = 200;
          response.setHeader("content-type", remote.response.headers.get("content-type") ?? "application/octet-stream");
          response.setHeader("content-disposition", dispositionFor(name2));
          response.setHeader("cache-control", "no-store");
          await streamRemote(remote.response.body, response, MAX_LINK_BYTES);
        } catch (error) {
          warn("save link failed", error);
          if (!response.headersSent) sendFailure(response, 502, "fetch-failed");
          else response.destroy();
        } finally {
          clearTimeout(timer);
        }
      })
    },
    {
      kind: "exact",
      path: SAVE_AS_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "POST") {
          sendMethodNotAllowed(response, "POST");
          return;
        }
        const body = await readJsonBody(request);
        if (body === void 0) {
          sendFailure(response, 400, "bad-request");
          return;
        }
        const target = await resolved(response, body.sessionId, body.path);
        if (target === void 0) return;
        if (target.isDirectory) {
          sendFailure(response, 400, "not-a-file");
          return;
        }
        const directory = await safeDirectory(body.directory);
        if (directory === void 0) {
          sendFailure(response, 400, "no-directory");
          return;
        }
        try {
          const savedPath = await copyInto(directory, target.path, basename(target.path), MAX_FILE_BYTES);
          sendJson(response, 200, { ok: true, savedPath });
        } catch (error) {
          const refusal = error instanceof SaveRefusal ? error : new SaveRefusal(500, "save-failed");
          warn(`save-as refused: ${refusal.code}`, error);
          sendFailure(response, refusal.status, refusal.code);
        }
      })
    },
    {
      kind: "exact",
      path: SAVE_LINK_AS_ROUTE,
      handler: guarded(async (request, response) => {
        if (rejected(request, response)) return;
        if (request.method !== "POST") {
          sendMethodNotAllowed(response, "POST");
          return;
        }
        const body = await readJsonBody(request);
        if (body === void 0) {
          sendFailure(response, 400, "bad-request");
          return;
        }
        const directory = await safeDirectory(body.directory);
        if (directory === void 0) {
          sendFailure(response, 400, "no-directory");
          return;
        }
        const checked = await checkedRemoteUrl(body.url, "fetch");
        if (!checked.ok) {
          sendFailure(response, 400, checked.error);
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, LINK_TIMEOUT_MS);
        try {
          const remote = await followRemote(checked.url, controller.signal);
          if (!remote.ok) {
            sendFailure(response, 502, remote.error);
            return;
          }
          const declared = Number(remote.response.headers.get("content-length") ?? "0");
          if (Number.isFinite(declared) && declared > MAX_LINK_BYTES) {
            await remote.response.body?.cancel();
            sendFailure(response, 413, "too-large");
            return;
          }
          const address = new URL(remote.response.url === "" ? checked.url.toString() : remote.response.url);
          const name2 = basename(address.pathname) || "download";
          const destination = await uniqueDestination(directory, name2);
          await writeRemote(remote.response.body, destination, MAX_LINK_BYTES);
          sendJson(response, 200, { ok: true, savedPath: destination });
        } catch (error) {
          const refusal = error instanceof SaveRefusal ? error : new SaveRefusal(502, "fetch-failed");
          warn(`save-link-as refused: ${refusal.code}`, error);
          sendFailure(response, refusal.status, refusal.code);
        } finally {
          clearTimeout(timer);
        }
      })
    }
  ];
}

// src/index.ts
var name = "dsh-file-link-menu";
var inject = ["webServer", "connection"];
function serviceOf(ctx, key) {
  const reader = ctx.get;
  if (typeof reader === "function") {
    const value = reader.call(ctx, key);
    return typeof value === "object" && value !== null ? value : void 0;
  }
  return void 0;
}
async function resolveWorkspace(ctx, sessionId) {
  if (sessionId.length === 0) return void 0;
  const query = serviceOf(ctx, "sessionQuery");
  if (query !== void 0) {
    try {
      const snapshot = await query.readSession(sessionId);
      const cwd = snapshot?.session?.cwd;
      if (typeof cwd === "string" && cwd.length > 0) return cwd;
    } catch (error) {
      ctx.logger?.warn?.("dsh-file-link-menu: session lookup failed", error);
    }
  }
  const policy = serviceOf(ctx, "sandboxPolicy");
  const root = policy?.workspaceRoot;
  return typeof root === "string" && root.length > 0 ? root : void 0;
}
async function resolveRoots(ctx, sessionId, storeRoot) {
  const workspace = await resolveWorkspace(ctx, sessionId);
  return {
    ...workspace === void 0 ? {} : { workspace },
    ...storeRoot === void 0 ? {} : { attachments: storeRoot }
  };
}
function apply(ctx) {
  const connection = serviceOf(ctx, "connection");
  const webServer = serviceOf(ctx, "webServer");
  if (connection === void 0 || webServer === void 0) {
    ctx.logger?.warn?.("dsh-file-link-menu: webServer or connection unavailable; no routes registered");
    return;
  }
  const store = serviceOf(ctx, "attachments");
  const storeRoot = attachmentStoreRoot(store);
  const lookup2 = createAttachmentLookup({
    store,
    warn: (message, error) => {
      ctx.logger?.warn?.(`dsh-file-link-menu: ${message}`, error);
    }
  });
  const routes = buildRoutes({
    connection,
    resolveRoot: (sessionId) => resolveRoots(ctx, sessionId, storeRoot),
    resolveAttachment: lookup2,
    warn: (message, error) => {
      ctx.logger?.warn?.(`dsh-file-link-menu: ${message}`, error);
    }
  });
  for (const route of routes) {
    ctx.effect(() => webServer.register(route), `dsh-file-link-menu: ${route.path}`);
  }
  ctx.logger?.info?.(
    storeRoot === void 0 ? "dsh-file-link-menu: host routes ready \u2014 workspace files only (no attachment store on this composition)" : `dsh-file-link-menu: host routes ready \u2014 workspace files and attachments (${storeRoot})`
  );
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
