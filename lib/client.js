var module = { exports: {} }; var exports = module.exports; window.__ModuleLoader__.load({ id: "dsh-file-link-menu", factory: (require) => {
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  FileLinkMenuController: () => FileLinkMenuController,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

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

// src/client/controller.ts
var MenuActionError = class extends Error {
  /**
   * @param code - stable failure code from the Host, or a browser-side code.
   */
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "MenuActionError";
  }
};
function hostBase() {
  const origin = globalThis.location?.origin;
  return origin !== void 0 && origin !== "" && origin !== "null" ? origin : "http://dsh.internal";
}
var FileLinkMenuController = class {
  caps = null;
  loading;
  /** Capabilities already read, for the first render after a page cache. */
  get known() {
    return this.caps;
  }
  /** Read Host capabilities once per page; a failed read hides every Host row. */
  loadCaps() {
    this.loading ??= this.readCaps();
    return this.loading;
  }
  async readCaps() {
    try {
      const response = await fetch(new URL(CAPS_ROUTE, hostBase()), { headers: { accept: "application/json" } });
      if (!response.ok) return null;
      const payload = await response.json();
      this.caps = {
        platform: payload.platform,
        fileManager: payload.fileManager ?? null,
        desktop: payload.desktop === true,
        apps: Array.isArray(payload.apps) ? payload.apps.filter((id) => typeof id === "string") : [],
        openUrl: payload.openUrl === true,
        saveAs: payload.saveAs === true,
        saveLink: payload.saveLink === true
      };
      return this.caps;
    } catch {
      return null;
    }
  }
  /** Open one Session file with the default application. */
  async open(sessionId, path) {
    await this.mutate(OPEN_ROUTE, { sessionId, path });
  }
  /**
   * Resolve one attached file's display name to the path the Host stored it at.
   *
   * An attachment card carries the name only, so every action that needs a path
   * starts here; the answer's path is inside the Host's attachment store, which
   * the Host's own routes admit as a second root.
   * @param name - display name the attachment card carried.
   * @returns the stored path and byte length.
   */
  async attachmentPath(name) {
    const payload = await this.mutate(ATTACHMENT_ROUTE, { name });
    const { path, bytes } = payload;
    if (typeof path !== "string" || path.length === 0) throw new MenuActionError("unknown-attachment");
    return { path, bytes: typeof bytes === "number" ? bytes : 0 };
  }
  /** Select one Session file in the Host file manager. */
  async reveal(sessionId, path) {
    await this.mutate(REVEAL_ROUTE, { sessionId, path });
  }
  /** Open one Session file with one probed application. */
  async openWith(sessionId, path, app) {
    await this.mutate(OPEN_WITH_ROUTE, { sessionId, path, app });
  }
  /** Hand one external URL to the Host's default browser. */
  async openUrl(url) {
    await this.mutate(OPEN_URL_ROUTE, { url });
  }
  /**
   * Copy one Session file into a directory the user chose.
   * @param sessionId - Session that declared the file.
   * @param path - path as the menu read it off the DOM.
   * @param directory - absolute destination directory from the Host picker.
   * @returns the path the Host wrote.
   */
  async saveAs(sessionId, path, directory) {
    return await this.savedPath(await this.mutate(SAVE_AS_ROUTE, { sessionId, path, directory }));
  }
  /**
   * Write one remote URL into a directory the user chose.
   * @param url - validated http(s) URL.
   * @param directory - absolute destination directory from the Host picker.
   * @returns the path the Host wrote.
   */
  async saveLinkAs(url, directory) {
    return await this.savedPath(await this.mutate(SAVE_LINK_AS_ROUTE, { url, directory }));
  }
  /** Read the written path out of one save answer. */
  savedPath(payload) {
    const saved = payload.savedPath;
    if (typeof saved !== "string" || saved.length === 0) throw new MenuActionError("save-failed");
    return saved;
  }
  /** Start a browser download of one Session file. */
  download(sessionId, path) {
    this.triggerDownload(new URL(`${DOWNLOAD_ROUTE}?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`, hostBase()));
  }
  /** Start a browser download of one remote URL. */
  downloadLink(url) {
    this.triggerDownload(new URL(`${DOWNLOAD_LINK_ROUTE}?url=${encodeURIComponent(url)}`, hostBase()));
  }
  /** Copy one string to the clipboard, with a selection fallback for insecure origins. */
  async copyText(text) {
    try {
      if (navigator.clipboard?.writeText !== void 0) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.append(area);
    try {
      area.select();
      if (!document.execCommand("copy")) throw new MenuActionError("copy-failed");
    } catch {
      throw new MenuActionError("copy-failed");
    } finally {
      area.remove();
    }
  }
  async mutate(route, body) {
    let response;
    try {
      response = await fetch(new URL(route, hostBase()), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch {
      throw new MenuActionError("network");
    }
    let payload = { ok: response.ok };
    try {
      payload = await response.json();
    } catch {
    }
    if (!response.ok || payload.ok !== true) throw new MenuActionError(payload.error ?? `http-${String(response.status)}`);
    return payload;
  }
  /**
   * Start one attachment download without navigating the app away.
   *
   * A direct anchor or location change makes the browser leave the Harness
   * page whenever the Host answers with anything but an attachment (a refusal,
   * for instance), which loses the whole conversation view. A hidden frame
   * takes that navigation instead, so a failed download is invisible here and
   * the Host's `Content-Disposition` still drives the shell's own save flow.
   */
  triggerDownload(url) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("data-dsh-file-link-menu-download", "");
    frame.style.display = "none";
    frame.src = url.toString();
    document.body.append(frame);
    setTimeout(() => {
      frame.remove();
    }, 6e4);
  }
};

// src/client/surfaces.ts
var PRESENTED_ROW = "[data-presented-files-row]";
var PRODUCED_ROW = "[data-produced-files-row]";
var MESSAGE_ATTACHMENTS = "[data-message-attachments]";
var FULL_PATH_ATTR = "data-flm-full-path";
function classNamed(node, suffix) {
  const value = node.getAttribute("class");
  if (value === null) return false;
  return value.split(/\s+/u).some((name) => name.endsWith(suffix));
}
function attachmentTargetOf(node) {
  if (node == null) return void 0;
  const chip = chipTargetOf(node);
  if (chip !== void 0) return chip.kind === "attachment" ? chip : void 0;
  const card = node.closest(MESSAGE_ATTACHMENTS) !== null ? node.closest(`${MESSAGE_ATTACHMENTS} [title]`) : composerCardOf(node);
  if (card == null) return void 0;
  const name = (card.getAttribute("title") ?? "").trim();
  if (name.length === 0 || name.includes("/") || name.includes("\\")) return void 0;
  return { kind: "attachment", name, source: "attachment" };
}
function composerCardOf(node) {
  const card = node.closest("[title][class]");
  if (card == null || !classNamed(card, "_card")) return void 0;
  const item = card.parentElement;
  if (item == null || !classNamed(item, "_item")) return void 0;
  const rail = item.parentElement;
  if (rail == null || !classNamed(rail, "_rail") || rail.getAttribute("role") !== "group") return void 0;
  return card;
}
function looksLikePath(value) {
  if (value.length === 0 || value.length > 4096) return false;
  if (/[\u0000-\u001f]/u.test(value)) return false;
  const trimmed = value.trim();
  return trimmed.includes("/") || trimmed.includes("\\") || /\.[A-Za-z0-9]{1,8}$/u.test(trimmed);
}
function httpUrlOf(value) {
  const trimmed = value.trim();
  if (!/^https?:\/\//iu.test(trimmed)) return void 0;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : void 0;
  } catch {
    return void 0;
  }
}
var PASTE_NAME = /^paster-[^\s/\\]{1,240}$/u;
function isPasteName(value) {
  return PASTE_NAME.test(value);
}
function referencePathOf(title) {
  const token = title.trim();
  if (!token.startsWith("@")) return void 0;
  const body = token.slice(1);
  if (!body.startsWith('"')) return body.length === 0 ? void 0 : body;
  return body.length >= 3 && body.endsWith('"') ? body.slice(1, -1) : void 0;
}
function referenceChipOf(node) {
  const chip = node?.closest('button[data-ref-chip="file"][title]');
  if (chip == null) return void 0;
  const token = referencePathOf(chip.title);
  return token === void 0 ? void 0 : { chip, token };
}
function chipTargetOf(node) {
  const found = referenceChipOf(node);
  if (found === void 0) return void 0;
  if (isPasteName(found.token)) return { kind: "attachment", name: found.token, source: "attachment" };
  return looksLikePath(found.token) ? { kind: "file", path: found.token, source: "mention" } : void 0;
}
function chipOf(node) {
  const direct = node?.closest("button[title]");
  if (direct != null) return direct;
  return node?.closest("code")?.querySelector("button[title]") ?? void 0;
}
function stampedPathOf(control) {
  const stamped = control.getAttribute(FULL_PATH_ATTR);
  if (stamped !== null && stamped !== "") return stamped;
  const title = control.title.trim();
  return title !== "" && looksLikePath(title) ? title : void 0;
}
function fileTargetOf(node) {
  const chip = chipOf(node);
  if (chip == null) return void 0;
  if (chip.dataset.refChip === "file") return chipTargetOf(node);
  const path = stampedPathOf(chip);
  if (path === void 0) return void 0;
  if (chip.closest(PRESENTED_ROW) !== null) return { kind: "file", path, source: "presented" };
  if (chip.closest(PRODUCED_ROW) !== null) return { kind: "file", path, source: "produced" };
  if (chip.getAttribute("aria-label") === null) return void 0;
  return { kind: "file", path, source: "mention" };
}
function toolTargetOf(node) {
  const card = node?.closest("[data-tool]");
  if (card == null) return void 0;
  const button = node?.closest("button");
  if (button == null || !card.contains(button)) return void 0;
  const stamped = button.getAttribute(FULL_PATH_ATTR);
  const path = stamped !== null && stamped !== "" ? stamped : (button.textContent ?? "").trim();
  if (!looksLikePath(path)) return void 0;
  if (stamped === null || stamped === "") {
    if (!path.includes("/")) return void 0;
  }
  return { kind: "file", path, source: "tool" };
}
function detectTarget(node, selection = "") {
  const anchor = node?.closest("a[href]");
  if (anchor != null) {
    const url = httpUrlOf(anchor.getAttribute("href") ?? "");
    return url === void 0 ? void 0 : { kind: "link", url };
  }
  const selectionUrl = httpUrlOf(selection);
  if (selectionUrl !== void 0 && selection.trim() === selectionUrl) return { kind: "link", url: selectionUrl };
  return fileTargetOf(node) ?? attachmentTargetOf(node) ?? toolTargetOf(node);
}

// src/client/chips.ts
var ICON_ID_TOKEN = /dsh-code-icon-[A-Za-z0-9]+/gu;
function scopeIconIds(markup, instance) {
  return markup.replace(ICON_ID_TOKEN, (id) => `${id}-flm${String(instance)}`);
}
var ENHANCED_ATTR = "data-flm-enhanced";
var ICON_ATTR = "data-flm-icon";
var SHOWN_NAME_ATTR = "data-flm-shown";
var ICON_PATH_ATTR = "data-flm-icon-for";
var CHIP_SELECTOR = [
  '[data-tool] button[class*="_fileLink"]',
  "[data-produced-files-row] button[title]",
  "code > button[title]",
  'button[data-ref-chip="file"][title]'
].join(", ");
function classNamed2(node, suffix) {
  const value = node.getAttribute("class");
  if (value === null) return false;
  return value.split(/\s+/u).some((name) => name.endsWith(suffix));
}
function hasSeparator(value) {
  return value.includes("/") || value.includes("\\");
}
function displayNameOf(path) {
  const trimmed = path.replace(/[/\\]+$/u, "");
  if (trimmed === "") return path;
  if (!hasSeparator(trimmed)) return trimmed;
  const name = trimmed.slice(Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1);
  return name === "" ? trimmed : name;
}
function pathOf(element, shape) {
  if (shape === "reference") {
    const token = referencePathOf((element.getAttribute("title") ?? "").trim());
    if (token === void 0 || isPasteName(token)) return void 0;
    return hasSeparator(token) || looksLikePath(token) ? token : void 0;
  }
  const title = (element.getAttribute("title") ?? "").trim();
  const text = (element.textContent ?? "").trim();
  const stamped = element.getAttribute(FULL_PATH_ATTR);
  const shown = element.getAttribute(SHOWN_NAME_ATTR);
  if (stamped !== null && stamped !== "" && shown !== null && shown !== "" && text !== shown && looksLikePath(text)) {
    return text;
  }
  if (stamped !== null && stamped !== "") return stamped;
  if (title !== "" && looksLikePath(title)) return title;
  if (shape !== "tool") return void 0;
  return looksLikePath(text) ? text : void 0;
}
function isElement(node) {
  if (node === null) return false;
  const candidate = node;
  return typeof candidate.closest === "function" && typeof candidate.getAttribute === "function" && typeof candidate.querySelector === "function";
}
function recognizeChip(element) {
  if (!isElement(element)) return void 0;
  const shape = element.closest("[data-tool]") !== null && classNamed2(element, "_fileLink") ? "tool" : element.closest("[data-produced-files-row]") !== null ? "produced" : element.dataset.refChip === "file" ? "reference" : element.parentElement?.tagName === "CODE" && element.getAttribute("aria-label") !== null ? "mention" : void 0;
  if (shape === void 0) return void 0;
  const path = pathOf(element, shape);
  return path === void 0 ? void 0 : { element, shape, path };
}

// src/client/enhance.ts
var SCAN_ROOTS = "[data-chat-flow], #root";
var TEXT_NODE = 3;
function textNodeOf(element) {
  const own = directTextOf(element);
  if (own !== null) return own;
  for (const child of element.children) {
    const nested = directTextOf(child);
    if (nested !== null) return nested;
  }
  return null;
}
function directTextOf(element) {
  for (const node of element.childNodes) {
    if (node.nodeType === TEXT_NODE && (node.nodeValue ?? "").trim() !== "") return node;
  }
  return null;
}
function applyChip(element, glyph) {
  const target = recognizeChip(element);
  if (target === void 0) return false;
  const { path } = target;
  const text = textNodeOf(element);
  const icon = element.querySelector(`[${ICON_ATTR}]`);
  let changed = false;
  if (icon === null || element.getAttribute(ICON_PATH_ATTR) !== path) {
    const built = glyph(path);
    if (built !== null) {
      icon?.remove();
      element.insertBefore(built, element.firstChild);
      element.setAttribute(ICON_PATH_ATTR, path);
      changed = true;
    }
  }
  const name = displayNameOf(path);
  if (text !== null && text.nodeValue !== name) {
    text.nodeValue = name;
    changed = true;
  }
  if (text !== null && element.getAttribute(SHOWN_NAME_ATTR) !== name) {
    element.setAttribute(SHOWN_NAME_ATTR, name);
    changed = true;
  }
  if (element.getAttribute(FULL_PATH_ATTR) !== path) {
    element.setAttribute(FULL_PATH_ATTR, path);
    changed = true;
  }
  if (changed) element.setAttribute(ENHANCED_ATTR, "");
  return changed;
}
function applyRegion(node, glyph) {
  const start = isElement2(node) ? node : node.parentElement;
  if (start === null || start === void 0) return;
  const owner = start.closest(CHIP_SELECTOR);
  if (isElement2(owner)) applyChip(owner, glyph);
  else if (isElement2(start)) applyChip(start, glyph);
  for (const chip of start.querySelectorAll(CHIP_SELECTOR)) {
    if (isElement2(chip)) applyChip(chip, glyph);
  }
}
function isElement2(node) {
  if (node === null || node === void 0) return false;
  const candidate = node;
  return typeof candidate.matches === "function" && typeof candidate.querySelectorAll === "function" && typeof candidate.getAttribute === "function";
}
function attachChipEnhancement(glyph) {
  const pending = /* @__PURE__ */ new Set();
  let frame = null;
  let disposed = false;
  const flush = () => {
    frame = null;
    if (disposed) return;
    const regions = [...pending];
    pending.clear();
    for (const node of regions) applyRegion(node, glyph);
  };
  const schedule = (node) => {
    pending.add(node);
    if (frame !== null) return;
    if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(flush);
    else if (typeof setTimeout === "function") frame = setTimeout(flush, 0);
  };
  const scan = () => {
    if (typeof document === "undefined" || document.body === null) return;
    for (const root of document.querySelectorAll(SCAN_ROOTS)) applyRegion(root, glyph);
  };
  const observer = typeof MutationObserver === "function" ? new MutationObserver((records) => {
    for (const record of records) schedule(record.target);
  }) : null;
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
  scan();
  return {
    scan,
    dispose: () => {
      disposed = true;
      observer?.disconnect();
      if (frame !== null) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
        else clearTimeout(frame);
        frame = null;
      }
    }
  };
}

// src/client/icons.ts
var import_react = require("react");
var import_client = require("react-dom/client");
var import_react_dom = require("react-dom");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var RENDER_SIZE = 16;
var instanceCounter = 0;
var IconFactory = class {
  cache = /* @__PURE__ */ new Map();
  holder = null;
  root = null;
  /**
   * Markup for one file type, built once and shared by every later chip.
   * @param path - file path the type is classified from.
   * @returns the markup, or undefined when no glyph can be built.
   */
  markupFor(path) {
    if (typeof import_dsh_client_ui_primitives.FileTypeIcon !== "function") return void 0;
    let type;
    try {
      type = (0, import_dsh_client_ui_primitives.classifyFileType)(path);
    } catch {
      return void 0;
    }
    const cached = this.cache.get(type);
    if (cached !== void 0) return cached;
    this.holder ??= document.createElement("div");
    this.root ??= (0, import_client.createRoot)(this.holder);
    try {
      (0, import_react_dom.flushSync)(() => {
        this.root?.render((0, import_react.createElement)(import_dsh_client_ui_primitives.FileTypeIcon, { path, size: RENDER_SIZE }));
      });
    } catch {
      return void 0;
    }
    const markup = this.holder.innerHTML;
    if (markup === "") return void 0;
    this.cache.set(type, markup);
    return markup;
  }
  /**
   * Build one glyph element whose ids are unique to this instance.
   * @param path - file path the type is classified from.
   * @returns the element, or null when no glyph can be built.
   */
  elementFor(path) {
    const markup = this.markupFor(path);
    if (markup === void 0) return null;
    const holder = document.createElement("div");
    instanceCounter += 1;
    holder.innerHTML = scopeIconIds(markup, instanceCounter);
    const element = holder.firstElementChild;
    if (element === null) return null;
    element.setAttribute(ICON_ATTR, "");
    return element;
  }
};
function createIconFactory() {
  const factory = new IconFactory();
  return (path) => factory.elementFor(path);
}

// src/client/FileLinkMenu.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
var OPEN_WITH = "file.openWith";
var OPEN_WITH_PREFIX = `${OPEN_WITH}.`;
var APP_LABEL_KEYS = {
  vscode: "app.vscode",
  vscodeinsiders: "app.vscodeinsiders",
  cursor: "app.cursor",
  zed: "app.zed",
  windsurf: "app.windsurf",
  sublimetext: "app.sublimetext",
  xcode: "app.xcode",
  ghostty: "app.ghostty",
  iterm: "app.iterm",
  warp: "app.warp",
  kitty: "app.kitty",
  terminal: "app.terminal"
};
var ERROR_KEYS = {
  "copy-failed": "error.copy",
  "network": "error.fetch",
  "invalid-path": "error.badRequest",
  "bad-request": "error.badRequest",
  "outside-workspace": "error.outsideWorkspace",
  "missing": "error.missing",
  "no-workspace": "error.noWorkspace",
  "unknown-attachment": "error.unknownAttachment",
  "no-attachment-store": "error.noAttachmentStore",
  "not-a-file": "error.notAFile",
  "too-large": "error.tooLarge",
  "unsupported-platform": "error.unsupported",
  "unknown-app": "error.unknownApp",
  "invalid-url": "error.invalidUrl",
  "private-address": "error.privateAddress",
  "unresolved-host": "error.unresolvedHost",
  "fetch-failed": "error.fetch",
  "bad-response": "error.fetch",
  "too-many-redirects": "error.fetch"
};
function revealKey(caps) {
  if (caps?.fileManager === "explorer") return "file.revealExplorer";
  if (caps?.fileManager === "directory") return "file.revealDirectory";
  return "file.revealFinder";
}
function errorKey(code) {
  const mapped = ERROR_KEYS[code];
  if (mapped !== void 0) return mapped;
  return code.startsWith("remote-") ? "error.remote" : "error.generic";
}
function menuItems(target, caps, t) {
  if (target.kind === "link") {
    const rows2 = [{ id: "link.openTab", label: t("link.openTab") }];
    if (caps?.openUrl === true) rows2.push({ id: "link.openExternal", label: t("link.openExternal") });
    rows2.push({ type: "separator", id: "link.separator" });
    rows2.push({ id: "link.copy", label: t("link.copy") });
    if (caps?.saveLink === true) rows2.push({ id: "link.saveAs", label: t("link.saveAs") });
    return rows2;
  }
  const apps = (caps?.apps ?? []).filter((id) => APP_LABEL_KEYS[id] !== void 0);
  const rows = [{ id: "file.open", label: t("file.open") }];
  if (apps.includes("vscode")) rows.push({ id: "file.openInVscode", label: t("file.openInVscode") });
  if (apps.length > 0) {
    rows.push({
      id: OPEN_WITH,
      label: t("file.openWith"),
      submenu: apps.map((id) => ({ id: `${OPEN_WITH_PREFIX}${id}`, label: t(APP_LABEL_KEYS[id]) }))
    });
  }
  rows.push({ type: "separator", id: "file.separator.primary" });
  if (caps?.saveAs === true) rows.push({ id: "file.saveAs", label: t("file.saveAs") });
  rows.push({ id: "file.copyPath", label: t("file.copyPath") });
  if (caps?.desktop === true) {
    rows.push({ type: "separator", id: "file.separator.host" });
    rows.push({ id: "file.reveal", label: t(revealKey(caps)) });
  }
  return rows;
}
var MenuBoundary = class extends import_react2.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error, info) {
    console.error("[dsh-file-link-menu] menu render failed; the built-in menus are untouched", error, info.componentStack);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
};
function FileLinkMenuSurface({ sessionId, controller, pickDirectory, previewFile, t }) {
  const [state, setState] = (0, import_react2.useState)(null);
  const [caps, setCaps] = (0, import_react2.useState)(controller.known);
  const [toast, setToast] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    let live = true;
    void controller.loadCaps().then((loaded) => {
      if (live) setCaps(loaded);
    });
    return () => {
      live = false;
    };
  }, [controller]);
  (0, import_react2.useEffect)(() => {
    const onContextMenu = (event) => {
      if (event.defaultPrevented || event.button !== 2) return;
      const selection = globalThis.getSelection?.()?.toString() ?? "";
      const target = detectTarget(event.target, selection);
      if (target === void 0) return;
      event.preventDefault();
      event.stopPropagation();
      setState({ target, rect: new DOMRect(event.clientX, event.clientY, 0, 0) });
    };
    document.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, []);
  const items = (0, import_react2.useMemo)(
    () => state === null ? [] : menuItems(state.target, caps, t),
    [state, caps, t]
  );
  const close = (0, import_react2.useCallback)(() => {
    setState(null);
  }, []);
  const anchorRect = (0, import_react2.useCallback)(() => state?.rect ?? null, [state]);
  const fail = (0, import_react2.useCallback)((id, error) => {
    const code = error instanceof MenuActionError ? error.code : "generic";
    console.warn(`[dsh-file-link-menu] ${id} failed: ${code}`);
    setToast(t(errorKey(code)));
  }, [t]);
  const pathOf2 = (0, import_react2.useCallback)(
    async (target) => {
      if (target.kind === "file") return target.path;
      return (await controller.attachmentPath(target.name)).path;
    },
    [controller]
  );
  const showAttachment = (0, import_react2.useCallback)((path) => {
    if (previewFile !== void 0) {
      try {
        previewFile(path);
        return;
      } catch (error) {
        console.warn("[dsh-file-link-menu] sidebar preview refused the file; opening it with the Host", error);
      }
    }
    void controller.open(sessionId, path).catch((error) => {
      fail("attachment.preview", error);
    });
  }, [previewFile, controller, sessionId, fail]);
  (0, import_react2.useEffect)(() => {
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const node = event.target;
      const target = attachmentTargetOf(node);
      if (target?.kind !== "attachment") return;
      const pressed = node?.closest("button");
      if (pressed != null && pressed.getAttribute("data-ref-chip") === null) return;
      event.preventDefault();
      event.stopPropagation();
      void controller.attachmentPath(target.name).then(
        (found) => {
          showAttachment(found.path);
        },
        (error) => {
          fail("attachment.preview", error);
        }
      );
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [controller, showAttachment, fail]);
  const saveTo = (0, import_react2.useCallback)((id, action, fallback) => {
    if (pickDirectory === void 0) {
      fallback();
      setToast(t("action.saveStarted"));
      return;
    }
    void pickDirectory().then(
      (directory) => {
        if (directory === null || directory === "") {
          setToast(t("action.saveCancelled"));
          return;
        }
        void action(directory).then(
          (saved) => {
            setToast(t("action.saved", { path: saved }));
          },
          (error) => {
            fail(id, error);
          }
        );
      },
      (error) => {
        fail(id, error);
      }
    );
  }, [pickDirectory, fail, t]);
  const run = (0, import_react2.useCallback)((id) => {
    if (state === null) return;
    const { target } = state;
    setState(null);
    const report = (promise, done) => {
      void promise.then(
        () => {
          if (done !== void 0) setToast(t(done));
        },
        (error) => {
          const code = error instanceof MenuActionError ? error.code : "generic";
          console.warn(`[dsh-file-link-menu] ${id} failed: ${code}`);
          setToast(t(errorKey(code)));
        }
      );
    };
    try {
      if (target.kind === "link") {
        if (id === "link.openTab") {
          globalThis.open(target.url, "_blank", "noopener,noreferrer");
          return;
        }
        if (id === "link.openExternal") {
          report(controller.openUrl(target.url));
          return;
        }
        if (id === "link.copy") {
          report(controller.copyText(target.url), "action.copied");
          return;
        }
        if (id === "link.saveAs") {
          saveTo("link.saveAs", (directory) => controller.saveLinkAs(target.url, directory), () => {
            controller.downloadLink(target.url);
          });
          return;
        }
        return;
      }
      const file = target;
      const withPath = (use) => {
        void pathOf2(file).then(use, (error) => {
          fail(id, error);
        });
      };
      if (id === "file.open") {
        withPath((path) => {
          report(controller.open(sessionId, path));
        });
        return;
      }
      if (id === "file.openInVscode") {
        withPath((path) => {
          report(controller.openWith(sessionId, path, "vscode"));
        });
        return;
      }
      if (id === "file.copyPath") {
        withPath((path) => {
          report(controller.copyText(path), "action.copied");
        });
        return;
      }
      if (id === "file.saveAs") {
        withPath((path) => {
          saveTo("file.saveAs", (directory) => controller.saveAs(sessionId, path, directory), () => {
            controller.download(sessionId, path);
          });
        });
        return;
      }
      if (id === "file.reveal") {
        withPath((path) => {
          report(controller.reveal(sessionId, path));
        });
        return;
      }
      if (id.startsWith(OPEN_WITH_PREFIX)) {
        const app = id.slice(OPEN_WITH_PREFIX.length);
        withPath((path) => {
          report(controller.openWith(sessionId, path, app));
        });
      }
    } catch (error) {
      setToast(t(errorKey(error instanceof MenuActionError ? error.code : "generic")));
    }
  }, [state, controller, sessionId, saveTo, pathOf2, fail, t]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBoundary, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives2.Menu,
      {
        open: state !== null,
        anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-dsh-file-link-menu-anchor": true, hidden: true }),
        items,
        onSelect: run,
        onClose: close,
        portal: true,
        selection: "fill",
        autoFocus: true,
        getAnchorRect: anchorRect
      }
    ) }),
    toast !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives2.Toast, { text: toast, onDone: () => {
      setToast(null);
    } })
  ] });
}

// src/client/locales.ts
var NS = "dsh.fileLinkMenu";
var zh = {
  "file.open": "\u6253\u5F00\u6587\u4EF6",
  "file.openWith": "\u6253\u5F00\u65B9\u5F0F",
  "file.openInVscode": "\u5728 VS Code \u4E2D\u6253\u5F00",
  "file.saveAs": "\u53E6\u5B58\u4E3A\u2026",
  "file.copyPath": "\u590D\u5236\u6587\u4EF6\u8DEF\u5F84",
  "file.revealFinder": "\u5728\u8BBF\u8FBE\u4E2D\u663E\u793A",
  "file.revealExplorer": "\u5728\u6587\u4EF6\u8D44\u6E90\u7BA1\u7406\u5668\u4E2D\u663E\u793A",
  "file.revealDirectory": "\u6253\u5F00\u6240\u5728\u6587\u4EF6\u5939",
  "link.openTab": "\u5728\u65B0\u6807\u7B7E\u9875\u4E2D\u6253\u5F00",
  "link.openExternal": "\u5728\u5916\u90E8\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00",
  "link.copy": "\u590D\u5236\u94FE\u63A5",
  "link.saveAs": "\u94FE\u63A5\u53E6\u5B58\u4E3A\u2026",
  "action.copied": "\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
  "action.saveStarted": "\u5DF2\u5F00\u59CB\u4E0B\u8F7D",
  "action.saved": "\u5DF2\u4FDD\u5B58\u5230 {path}",
  "action.saveCancelled": "\u5DF2\u53D6\u6D88\u4FDD\u5B58",
  "error.copy": "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u3002",
  "error.open": "\u6253\u5F00\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "error.reveal": "\u65E0\u6CD5\u5728\u6587\u4EF6\u7BA1\u7406\u5668\u4E2D\u663E\u793A\u3002",
  "error.missing": "\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u79FB\u52A8\u3002",
  "error.outsideWorkspace": "\u8BE5\u6587\u4EF6\u4E0D\u5728\u5F53\u524D\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u533A\u5185\uFF0C\u5DF2\u62D2\u7EDD\u64CD\u4F5C\u3002",
  "error.noWorkspace": "\u8FD9\u4E2A\u4F1A\u8BDD\u6CA1\u6709\u5DE5\u4F5C\u533A\u76EE\u5F55\u3002",
  "error.notAFile": "\u8FD9\u662F\u4E00\u4E2A\u76EE\u5F55\uFF0C\u4E0D\u80FD\u53E6\u5B58\u4E3A\u6587\u4EF6\u3002",
  "error.tooLarge": "\u6587\u4EF6\u592A\u5927\uFF0C\u65E0\u6CD5\u53E6\u5B58\u3002",
  "error.noDirectory": "\u76EE\u6807\u76EE\u5F55\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u5199\u3002",
  "error.saveFailed": "\u5199\u5165\u76EE\u6807\u6587\u4EF6\u5931\u8D25\u3002",
  "error.unsupported": "\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u8FD9\u4E2A\u64CD\u4F5C\u3002",
  "error.unknownApp": "\u8FD9\u4E2A\u5E94\u7528\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u3002",
  "error.invalidUrl": "\u94FE\u63A5\u65E0\u6548\uFF0C\u53EA\u652F\u6301 http \u548C https\u3002",
  "error.privateAddress": "\u51FA\u4E8E\u5B89\u5168\u8003\u8651\uFF0C\u5DF2\u62D2\u7EDD\u8BBF\u95EE\u5185\u7F51\u5730\u5740\u3002",
  "error.unresolvedHost": "\u65E0\u6CD5\u89E3\u6790\u8BE5\u94FE\u63A5\u7684\u57DF\u540D\u3002",
  "error.remote": "\u8FDC\u7AEF\u62D2\u7EDD\u4E86\u4E0B\u8F7D\u8BF7\u6C42\u3002",
  "error.fetch": "\u94FE\u63A5\u4E0B\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "error.badRequest": "\u8BF7\u6C42\u65E0\u6548\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5\u3002",
  "error.unknownAttachment": "\u627E\u4E0D\u5230\u8FD9\u4E2A\u9644\u4EF6\uFF0C\u5B83\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\u3002",
  "error.noAttachmentStore": "\u8FD9\u4E2A\u90E8\u7F72\u6CA1\u6709\u4FDD\u5B58\u9644\u4EF6\u7684\u76EE\u5F55\u3002",
  "error.generic": "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "app.vscode": "VS Code",
  "app.vscodeinsiders": "VS Code Insiders",
  "app.cursor": "Cursor",
  "app.zed": "Zed",
  "app.windsurf": "Windsurf",
  "app.sublimetext": "Sublime Text",
  "app.xcode": "Xcode",
  "app.ghostty": "Ghostty",
  "app.iterm": "iTerm",
  "app.warp": "Warp",
  "app.kitty": "kitty",
  "app.terminal": "\u7EC8\u7AEF"
};
var en = {
  "file.open": "Open file",
  "file.openWith": "Open with",
  "file.openInVscode": "Open in VS Code",
  "file.saveAs": "Save as\u2026",
  "file.copyPath": "Copy file path",
  "file.revealFinder": "Reveal in Finder",
  "file.revealExplorer": "Show in File Explorer",
  "file.revealDirectory": "Open containing folder",
  "link.openTab": "Open in new tab",
  "link.openExternal": "Open in default browser",
  "link.copy": "Copy link",
  "link.saveAs": "Save link as\u2026",
  "action.copied": "Copied to clipboard",
  "action.saveStarted": "Download started",
  "action.saved": "Saved to {path}",
  "action.saveCancelled": "Save cancelled",
  "error.copy": "Copy failed. Copy it manually.",
  "error.open": "Could not open the file. Try again.",
  "error.reveal": "Could not show the file in the file manager.",
  "error.missing": "The file is gone or was moved.",
  "error.outsideWorkspace": "That file is outside this Session workspace, so the action was refused.",
  "error.noWorkspace": "This Session has no workspace directory.",
  "error.notAFile": "That is a directory, not a file to save.",
  "error.tooLarge": "The file is too large to save.",
  "error.noDirectory": "The destination directory does not exist or is not writable.",
  "error.saveFailed": "Could not write the destination file.",
  "error.unsupported": "This platform does not support the action.",
  "error.unknownApp": "That application is no longer available. Refresh the page.",
  "error.invalidUrl": "Invalid link. Only http and https are supported.",
  "error.privateAddress": "Refused: private network addresses are not allowed.",
  "error.unresolvedHost": "The link host name could not be resolved.",
  "error.remote": "The remote host refused the download.",
  "error.fetch": "The link download failed. Try again.",
  "error.badRequest": "Invalid request. Refresh the page and try again.",
  "error.unknownAttachment": "That attachment could not be found; it may have been removed.",
  "error.noAttachmentStore": "This deployment has no attachment store.",
  "error.generic": "The action did not complete. Try again.",
  "app.vscode": "VS Code",
  "app.vscodeinsiders": "VS Code Insiders",
  "app.cursor": "Cursor",
  "app.zed": "Zed",
  "app.windsurf": "Windsurf",
  "app.sublimetext": "Sublime Text",
  "app.xcode": "Xcode",
  "app.ghostty": "Ghostty",
  "app.iterm": "iTerm",
  "app.warp": "Warp",
  "app.kitty": "kitty",
  "app.terminal": "Terminal"
};

// src/client/preview.ts
var TEXT_PREVIEW_KIND = "text";
var FILE_ADDRESS_PREFIX = "dsh-resource://file/";
function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/giu, ":");
}
function sessionFileAddress(sessionId, path) {
  const segments = path.replace(/\\/gu, "/").split("/").map(encodeSegment).join("/");
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${segments}`;
}
function previewFileInSidebar(sidebar, sessionId, path) {
  sidebar.openResource(sessionFileAddress(sessionId, path), { kind: TEXT_PREVIEW_KIND });
}

// src/client/chips.module.css
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.dataset.pluginCss = "dsh-file-link-menu/chips";
  style.textContent = "/* The stamped file-type glyph.\n   Attribute selectors only: the build's CSS-modules step rewrites `.class`\n   names, and this sheet has no class to rewrite \u2014 every rule is keyed off the\n   attributes the enhancement layer stamps, which are the layer's own contract.\n   Every rule is scoped to a re-dressed chip, so a chip this plugin did not\n   touch keeps the shell's rendering exactly. */\n\n/* The shell's own chip glyph, beside the type glyph this layer stamps. It is\n   hidden rather than removed: React still owns that node, and taking it out of\n   the tree would leave the virtual DOM and the document disagreeing. */\n[data-flm-enhanced] > svg:not([data-flm-icon]),\n[data-flm-enhanced] > span > svg:not([data-flm-icon]) {\n  display: none;\n}\n\n/* The stamped glyph.\n   `1em` rides the chip's own font size, which each surface sets for itself (a\n   row's path link, an inline mention's code size). The offset seats its optical\n   center on the text's baseline for the surfaces that lay a chip out as inline\n   flow; a chip whose own rule is flex centers it through `align-items` and\n   ignores this. */\n[data-flm-icon] {\n  flex: none;\n  width: 1.15em;\n  height: 1.15em;\n  vertical-align: -0.18em;\n}\n\n/* Spacing belongs to the chip, not to the glyph: a produced chip is inline-flex\n   with its own `gap`, while a tool path link and an inline mention are plain\n   inline flow where the two would otherwise touch. */\n[data-flm-enhanced] > [data-flm-icon] {\n  margin-right: 5px;\n}\n\n/* An inline-flex chip already separates its children with `gap`. */\n[data-produced-files-row] [data-flm-icon] {\n  margin-right: 0;\n}\n";
  document.head.appendChild(style);
}

// src/client/index.ts
var inject = ["slots", "locale"];
function optionalService(ctx, key) {
  const reader = ctx.get;
  if (typeof reader === "function") {
    const value = reader.call(ctx, key);
    return typeof value === "object" && value !== null ? value : void 0;
  }
  try {
    const value = Reflect.get(ctx, key);
    return typeof value === "object" && value !== null ? value : void 0;
  } catch {
    return void 0;
  }
}
function apply(ctx) {
  try {
    const controller = new FileLinkMenuController();
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-file-link-menu: dictionaries");
    ctx.effect(
      () => attachChipEnhancement(createIconFactory()).dispose,
      "dsh-file-link-menu: path chips"
    );
    ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
      name: "conversation.input.overlay",
      id: "file-link-menu",
      // Among the composer's overlays the entry renders nothing visible, so its
      // order only decides where the invisible host sits.
      order: 1e3,
      locale: NS,
      // Optional services are read here rather than in `apply`: the injection
      // runs once the client composition is up, while a row applied earlier
      // than the workspace or Sidebar plugin would still find it missing.
      inject: (sessionId) => {
        const picker = optionalService(ctx, "uiWorkspace");
        const sidebar = optionalService(ctx, "sidebarRight");
        return {
          sessionId: sessionId ?? "",
          controller,
          ...picker === void 0 ? {} : { pickDirectory: () => picker.pickDirectory() },
          ...sidebar === void 0 ? {} : {
            previewFile: (path) => {
              if (sessionId === void 0 || sessionId.length === 0) {
                throw new Error("no Session is on screen to preview in");
              }
              previewFileInSidebar(sidebar, sessionId, path);
            }
          }
        };
      }
    }, FileLinkMenuSurface));
  } catch (error) {
    console.error("[dsh-file-link-menu] client registration failed; the built-in menus are untouched", error);
  }
}
return module.exports; } });
//# sourceMappingURL=client.js.map
