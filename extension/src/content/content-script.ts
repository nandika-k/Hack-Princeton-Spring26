import type { ScrapedItem } from '../types/item'
import type { Msg, Res } from '../lib/messages'
import { scrapeGeneric } from './scrapers/generic'
import { scrapeShopify } from './scrapers/shopify'
import { scrapeDepop } from './scrapers/depop'

const SCAN_DEBOUNCE_MS = 800
let lastUrl = location.href
let lastScrapedUrl = ''
let scanTimer: number | undefined

function scrape(): ScrapedItem | null {
  const host = location.hostname
  if (host.includes('depop.com')) return scrapeDepop() ?? scrapeGeneric()
  if (host.includes('shopify.com') || detectShopify()) return scrapeShopify() ?? scrapeGeneric()
  return scrapeGeneric()
}

function detectShopify(): boolean {
  return Boolean((window as unknown as { Shopify?: unknown }).Shopify)
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
  const item = scrape()
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

chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
  if (msg.kind === 'GET_CURRENT_ITEM') {
    const item = scrape()
    reply({ kind: 'CURRENT_ITEM', item, breakdown: null } satisfies Res)
    return true
  }
  return false
})
