/**
 * Action probe: performs one real menu action and reports the Host answer.
 *
 *   node scripts/probe-action.mjs <url> <treeitem-index> <row-label>
 *
 * Example: `… 3 打开文件` right-clicks the first tool-call path button and
 * clicks the menu row whose text contains the label.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

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
      // Try the next location.
    }
  }
  throw new Error('playwright not found')
}

const { chromium } = loadPlaywright()
const [url, index, label] = [process.argv[2], Number(process.argv[3] ?? '3'), process.argv[4] ?? '打开文件']
const chromePath = process.env.PW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chromePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

const responses = []
page.on('response', async response => {
  const request = response.request()
  if (!request.url().includes('/api/dsh-file-link-menu/')) return
  let body = ''
  try {
    body = (await response.text()).slice(0, 200)
  } catch {
    body = '(unreadable)'
  }
  responses.push({ method: request.method(), url: request.url().replace(/^https?:\/\/[^/]+/, ''), status: response.status(), body, post: request.postData() })
})
const errors = []
page.on('pageerror', error => { errors.push(String(error).slice(0, 200)) })

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.evaluate(index => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
  rows[index]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
}, index)
await page.waitForTimeout(7000)

const anchor = await page.evaluate(() => {
  const button = [...document.querySelectorAll('[data-tool] button')].find(node => (node.textContent ?? '').includes('/'))
  if (button === undefined) return { found: false }
  button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 500, clientY: 300 }))
  return { found: true, text: (button.textContent ?? '').trim() }
})
await page.waitForTimeout(500)

const clicked = await page.evaluate(label => {
  const lists = [...document.querySelectorAll('[role="menu"]')]
  const last = lists.at(-1)
  if (last === undefined) return 'no menu'
  const target = [...last.querySelectorAll('button')].find(node => (node.textContent ?? '').includes(label))
  if (target === undefined) return `no row matching ${label}`
  target.click()
  return 'clicked'
}, label)

await page.waitForTimeout(2500)
const toast = await page.evaluate(() => [...document.querySelectorAll('[class*="toast"], [role="status"]')]
  .map(node => (node.textContent ?? '').trim()).filter(Boolean).slice(0, 3))

console.log(JSON.stringify({ anchor, clicked, responses, toast, errors, stillAlive: (await page.content()).length > 1000 }, null, 1))
await browser.close()
