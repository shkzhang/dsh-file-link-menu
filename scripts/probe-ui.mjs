/**
 * Headless DOM probe for the file/link menu.
 *
 * Opens a running DSH Web instance, reports console/page errors, counts the
 * anchors this plugin claims, and reports whether file chips render as
 * interactive buttons. Development tool; Playwright is borrowed from the
 * sibling plugin so this package carries no browser dependency:
 *
 *   node scripts/probe-ui.mjs 'http://127.0.0.1:4396/?token=…'
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** Load Playwright from this package or from the sibling development plugin. */
function loadPlaywright() {
  const candidates = [
    () => createRequire(join(process.cwd(), 'package.json'))('playwright'),
    () => createRequire(join(process.cwd(), '../../plugins/dsh-codex-ui/package.json'))('playwright'),
    () => createRequire(join(process.cwd(), 'plugins/dsh-codex-ui/package.json'))('playwright'),
  ]
  for (const load of candidates) {
    try {
      return load()
    } catch {
      // Try the next location; the probe is optional tooling.
    }
  }
  throw new Error('playwright not found: install it in this package or keep plugins/dsh-codex-ui installed')
}

const { chromium } = loadPlaywright()

const url = process.argv[2]
if (url === undefined) throw new Error('usage: node scripts/probe-ui.mjs <url>')

// Playwright's bundled chromium may be absent; the installed Google Chrome
// drives the same checks and needs no download.
const chromePath = process.env.PW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chromePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const consoleLines = []
const errors = []
page.on('console', message => { consoleLines.push(`${message.type()}: ${message.text()}`) })
page.on('pageerror', error => { errors.push(String(error)) })

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

/** Count the anchors and surfaces this plugin recognizes. */
const snapshot = async label => page.evaluate(label => {
  const count = selector => document.querySelectorAll(selector).length
  const chipTitles = [...document.querySelectorAll('button[title]')].map(node => node.getAttribute('title') ?? '')
  return {
    label,
    presentedRows: count('[data-presented-files-row]'),
    producedRows: count('[data-produced-files-row]'),
    chipButtons: chipTitles.length,
    chipSample: chipTitles.slice(0, 5),
    externalLinks: count('a[target="_blank"]'),
    internalLinks: count('a[href^="/"]'),
    menuAnchor: count('[data-dsh-file-link-menu-anchor]'),
    bodyText: document.body.innerText.replace(/\s+/gu, ' ').slice(0, 160),
  }
}, label)

console.log(JSON.stringify(await snapshot('initial'), null, 1))

// Sidebar structure, so a caller can pick the session to open. Session rows are
// `[role="treeitem"]`; the row text lives in a nested span.
const rows = await page.evaluate(() => [...document.querySelectorAll('[role="treeitem"]')]
  .slice(0, 25)
  .map((node, index) => ({ index, text: (node.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 40) })))
console.log(JSON.stringify({ sidebarRows: rows }, null, 1))

// Open one conversation so the transcript (and its file chips) render. The
// third argument is a row index (from the dump above) or a text match.
const selector = process.argv[3] ?? '0'
const target = /^\d+$/u.test(selector)
  ? page.locator('[role="treeitem"]').nth(Number(selector))
  : page.locator('[role="treeitem"]').filter({ hasText: selector }).last()
if (await target.count() > 0) {
  await target.click().catch(() => {})
  await page.waitForTimeout(7000)
  console.log(JSON.stringify(await snapshot(`after-opening /${selector}/`), null, 1))
  const transcript = await page.evaluate(() => ({
    toolNodes: document.querySelectorAll('[data-tool]').length,
    toolNames: [...new Set([...document.querySelectorAll('[data-tool]')].map(n => n.getAttribute('data-tool')))],
    codeBlocks: document.querySelectorAll('pre').length,
    anchors: [...document.querySelectorAll('a[href]')].slice(0, 5).map(n => ({ href: n.getAttribute('href')?.slice(0, 60), target: n.getAttribute('target') })),
    titles: [...document.querySelectorAll('button[title], [title]')].slice(0, 10).map(n => String(n.getAttribute('title')).slice(0, 60)),
    presented: document.querySelectorAll('[data-presented-files-row]').length,
    produced: document.querySelectorAll('[data-produced-files-row]').length,
    menuAnchor: document.querySelectorAll('[data-dsh-file-link-menu-anchor]').length,
  }))
  console.log(JSON.stringify({ transcript }, null, 1))
} else {
  console.log(`(no treeitem matched /${match}/)`)
}

console.log('--- console (last 30) ---')
for (const line of consoleLines.slice(-30)) console.log(line.slice(0, 300))
console.log('--- page errors ---')
for (const line of errors.slice(-10)) console.log(line.slice(0, 400))

await browser.close()
