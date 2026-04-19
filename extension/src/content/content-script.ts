import type { ScrapedItem } from '../types/item'
import type { Msg, Res } from '../lib/messages'
import { scrapeGeneric } from './scrapers/generic'
import { scrapeShopify } from './scrapers/shopify'
import { scrapeDepop } from './scrapers/depop'
import { scrapeVinted } from './scrapers/vinted'
import { scrapeShein, expandSheinDescription } from './scrapers/shein'
import { findAdapter } from './adapters'
import { autoExpand } from './extract/expand'

const SCAN_DEBOUNCE_MS = 800
const GENERIC_TITLES = new Set(['depop', 'vinted', 'zara', 'h&m', 'hm', 'macy\'s', 'macys', 'loading', ''])
let lastUrl = location.href
let lastScrapedUrl = ''
let scanTimer: number | undefined

function debug(...args: unknown[]): void {
  try {
    if (localStorage.getItem('ecothread-debug') === '1') console.log('[ecothread]', ...args)
  } catch {
    // ignore storage access errors
  }
}

function isSpaHost(host: string): boolean {
  return host.includes('depop.com') || host.includes('vinted.') || host.includes('zara.com') || host.includes('hm.com') || host.includes('shein.com')
}

function isValidTitle(t: string | undefined): boolean {
  if (!t) return false
  const norm = t.trim().toLowerCase().replace(/[|\-–—].*$/, '').trim()
  if (norm.length < 3) return false
  return !GENERIC_TITLES.has(norm)
}

function scrape(): ScrapedItem | null {
  const host = location.hostname
  const adapter = findAdapter(host)
  const scope = adapter?.scope() ?? undefined

  let item: ScrapedItem | null
  if (host.includes('shein.com')) item = scrapeShein() ?? scrapeGeneric(scope)
  else if (host.includes('depop.com')) item = scrapeDepop() ?? scrapeGeneric(scope)
  else if (host.includes('vinted.')) item = scrapeVinted() ?? scrapeGeneric(scope)
  else if (host.includes('shopify.com') || detectShopify()) item = scrapeShopify() ?? scrapeGeneric(scope)
  else item = scrapeGeneric(scope)

  if (item && !isValidTitle(item.title)) {
    debug('rejected generic title', item.title)
    return null
  }
  if (item) debug('scraped', { title: item.title, material: item.material, origin: item.origin })
  return item
}

function detectShopify(): boolean {
  return Boolean((window as unknown as { Shopify?: unknown }).Shopify)
}

function hasFiberOrRichText(item: ScrapedItem | null): boolean {
  if (!item) return false
  if (item.material) return true
  return false
}

async function scrapeWithExpand(): Promise<ScrapedItem | null> {
  let item = scrape()
  if (hasFiberOrRichText(item)) return item
  await autoExpand()
  item = scrape()
  return item
}

async function getEnabled(): Promise<boolean> {
  try {
    const res = await new Promise<Res>((resolve, reject) => {
      chrome.runtime.sendMessage({ kind: 'GET_STATUS' } satisfies Msg, (r: Res | undefined) => {
        const err = chrome.runtime.lastError
        if (err) reject(new Error(err.message))
        else if (!r) reject(new Error('No response'))
        else resolve(r)
      })
    })
    return res.kind === 'STATUS' ? res.status.enabled : false
  } catch {
    return false
  }
}

async function runScan(): Promise<void> {
  if (!(await getEnabled())) return
  if (location.href === lastScrapedUrl) return
  const item = await scrapeWithExpand()
  if (!item) return
  lastScrapedUrl = location.href
  chrome.runtime.sendMessage({ kind: 'ITEM_DETECTED', item } satisfies Msg, () => {
    void chrome.runtime.lastError
  })
}

function scheduleScan(): void {
  if (scanTimer !== undefined) window.clearTimeout(scanTimer)
  scanTimer = window.setTimeout(() => {
    void runScan()
  }, SCAN_DEBOUNCE_MS)
}

function watchUrl(): void {
  const check = (): void => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      scheduleScan()
    }
  }
  window.addEventListener('popstate', check)
  const origPush = history.pushState
  const origReplace = history.replaceState
  history.pushState = function (...args) {
    const r = origPush.apply(this, args)
    check()
    return r
  }
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args)
    check()
    return r
  }
  const obs = new MutationObserver(() => check())
  obs.observe(document, { subtree: true, childList: true })
}

scheduleScan()
watchUrl()

async function scrapeWithRetry(): Promise<ScrapedItem | null> {
  const host = location.hostname
  const spa = isSpaHost(host)
  const preRetries = spa ? 8 : 4
  const postRetries = spa ? 8 : 4
  const delay = spa ? 300 : 250

  for (let i = 0; i < preRetries; i++) {
    const item = scrape()
    if (item && isValidTitle(item.title) && item.material) return item
    await new Promise((r) => setTimeout(r, delay))
  }
  if (host.includes('shein.com')) await expandSheinDescription()
  await autoExpand()
  for (let i = 0; i < postRetries; i++) {
    const item = scrape()
    if (item && item.material) return item
    await new Promise((r) => setTimeout(r, delay))
  }
  return scrape()
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
  if (msg.kind === 'GET_CURRENT_ITEM') {
    void scrapeWithRetry().then((item) => {
      reply({ kind: 'CURRENT_ITEM', item, breakdown: null } satisfies Res)
    })
    return true
  }
  return false
})
