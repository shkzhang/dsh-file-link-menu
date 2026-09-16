/**
 * Attachment probe: paste a long text into a running DSH Web instance, then
 * report what the attachment card does — the menu a right click opens, and the
 * right-Sidebar preview a left click opens, on the composer card and on the
 * card the transcript keeps after the message is sent.
 *
 * The paste goes through the `dsh-auto-paste` plugin, which is how an
 * attachment card appears at all; a composition without it can still be probed
 * for the transcript half by opening a Session that already carries one.
 *
 *   node scripts/probe-attachment.mjs <url> [sessionIndex]
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
const sessionIndex = Number(process.argv[3] ?? '0')
if (url === undefined) throw new Error('usage: node scripts/probe-attachment.mjs <url> [sessionIndex]')

const MARKER = `ATTACHMENT-PROBE-${String(Date.now())}`
const chromePath = process.env.PW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chromePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
// `复制文件路径` is read back from the clipboard, which needs an explicit grant.
await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
const errors = []
page.on('pageerror', error => { errors.push(String(error).slice(0, 300)) })

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.evaluate(index => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
  rows[index]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
}, sessionIndex)
await page.waitForTimeout(5000)

/** Report the row titles of the open menu, plus the card it was opened on. */
async function menuOn(selector) {
  const opened = await page.evaluate((query) => {
    const card = document.querySelector(query)
    if (card === null) return { found: false }
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 500, clientY: 400 }))
    return { found: true, title: card.getAttribute('title') }
  }, selector)
  await page.waitForTimeout(700)
  const rows = await page.evaluate(() => {
    const menu = [...document.querySelectorAll('[role="menu"]')].at(-1)
    if (menu === undefined) return null
    return [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')]
      .map(node => (node.textContent ?? '').trim())
      .filter(text => text.length > 0)
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  return { ...opened, rows }
}

/** Left-click one card and report whether the right Sidebar now shows the file. */
async function previewOf(selector) {
  const opened = await page.evaluate((query) => {
    const card = document.querySelector(query)
    if (card === null) return { found: false }
    const body = card.querySelector('[class$="_body"]') ?? card
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    body.dispatchEvent(event)
    return { found: true, claimed: event.defaultPrevented }
  }, selector)
  await page.waitForTimeout(3500)
  const shown = await page.evaluate((marker) => {
    const tabs = [...document.querySelectorAll('[data-dockkit-strip-tabs], [data-dockkit-pane]')]
      .map(node => (node.textContent ?? '').trim().slice(0, 80))
      .filter(text => text.length > 0)
    const hit = [...document.querySelectorAll('body *')]
      .filter(node => node.children.length === 0 && (node.textContent ?? '').includes(marker))
    return { paneText: [...new Set(tabs)].slice(0, 4), markerElements: hit.length, firstText: (hit[0]?.textContent ?? '').slice(0, 80) }
  }, MARKER)
  return { ...opened, ...shown }
}

/** Run one file row from a card's menu and report what the clipboard received. */
async function copyPathOf(selector) {
  const row = '复制文件路径'
  await page.evaluate((query) => {
    document.querySelector(query)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 500, clientY: 400 }),
    )
  }, selector)
  await page.waitForTimeout(700)
  const clicked = await page.evaluate((label) => {
    const menu = [...document.querySelectorAll('[role="menu"]')].at(-1)
    const item = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]
      .find(node => (node.textContent ?? '').trim() === label)
    if (item === undefined) return false
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    return true
  }, row)
  await page.waitForTimeout(1200)
  const clipboard = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText()
    } catch (error) {
      return `unreadable: ${String(error).slice(0, 60)}`
    }
  })
  const toast = await page.evaluate(() => [...document.querySelectorAll('[role="status"], [class*="toast"]')]
    .map(node => (node.textContent ?? '').trim()).filter(text => text.length > 0).slice(0, 2))
  return { row, clicked, clipboard, toast }
}

const composer = await page.evaluate((marker) => {
  const editable = document.querySelector('[contenteditable="true"]')
  if (editable === null) return { found: false }
  const value = `${marker} ${'z'.repeat(700)}`
  const transfer = new DataTransfer()
  transfer.setData('text/plain', value)
  editable.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  return { found: true }
}, MARKER)
await page.waitForTimeout(7000)

const CARD = '[class$="_card"][title]'
const report = {
  composerCard: await page.evaluate(query => document.querySelector(query)?.getAttribute('title') ?? null, CARD),
  composerMenu: await menuOn(CARD),
  composerPreview: await previewOf(CARD),
}

const send = await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')]
    .find(node => `${node.getAttribute('aria-label') ?? ''}${node.textContent ?? ''}`.includes('发送'))
  if (button === undefined) return { found: false }
  button.click()
  return { found: true }
})
if (send.found) await page.waitForTimeout(9000)

const TRANSCRIPT = '[data-message-attachments] span[title]'
report.transcriptCard = await page.evaluate(query => document.querySelector(query)?.getAttribute('title') ?? null, TRANSCRIPT)
report.transcriptMenu = await menuOn(TRANSCRIPT)
report.transcriptPreview = await previewOf(TRANSCRIPT)
report.transcriptCopyPath = await copyPathOf(TRANSCRIPT)
report.errors = errors
console.log(JSON.stringify(report, null, 1))
await browser.close()
