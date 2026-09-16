/**
 * End-to-end menu probe.
 *
 * Opens a running DSH Web instance, opens one session, right-clicks a real
 * anchor (a tool call's path button, or the first external link on the page),
 * and reports the menu rows the plugin rendered. Development tool:
 *
 *   node scripts/probe-menu.mjs <url> <treeitem-index> [tool|link]
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
  throw new Error('playwright not found')
}

const { chromium } = loadPlaywright()
const url = process.argv[2]
const sessionIndex = Number(process.argv[3] ?? '3')
const surface = process.argv[4] ?? 'tool'
if (url === undefined) throw new Error('usage: node scripts/probe-menu.mjs <url> <treeitem-index> [tool|link]')

const chromePath = process.env.PW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chromePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', error => { errors.push(String(error).slice(0, 300)) })

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const anchorReport = await page.evaluate(index => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
  rows[index]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  return { clicked: (rows[index]?.textContent ?? '').trim().slice(0, 40) }
}, sessionIndex)
await page.waitForTimeout(7000)

const anchor = await page.evaluate(surface => {
  if (surface === 'link') {
    const link = document.querySelector('a[target="_blank"]')
    if (link === null) return { found: false }
    link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 400, clientY: 300 }))
    return { found: true, text: (link.textContent ?? '').slice(0, 40) }
  }
  const button = [...document.querySelectorAll('[data-tool] button')]
    .find(node => (node.textContent ?? '').includes('/'))
  if (button === undefined) return { found: false, candidates: [...document.querySelectorAll('[data-tool] button')].map(n => (n.textContent ?? '').slice(0, 30)) }
  button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 400, clientY: 300 }))
  return { found: true, text: (button.textContent ?? '').trim() }
}, surface)
await page.waitForTimeout(600)

const menu = await page.evaluate(() => {
  const lists = [...document.querySelectorAll('[role="menu"]')]
  const last = lists.at(-1)
  return {
    listedMenus: lists.length,
    anchorHost: document.querySelectorAll('[data-dsh-file-link-menu-anchor]').length,
    items: last === undefined ? [] : [...last.querySelectorAll('button, [role="menuitem"], div')]
      .map(node => (node.textContent ?? '').trim())
      .filter(text => text.length > 0)
      .slice(0, 12),
  }
})

console.log(JSON.stringify({ anchorReport, anchor, menu, errors }, null, 1))
await browser.close()
