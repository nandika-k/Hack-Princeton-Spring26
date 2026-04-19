import type { ExtensionStatus, CacheEntry, SustainabilityBreakdown, ScrapedItem } from '../types/item'

const STATUS_KEY = 'ecothread.status'
const CACHE_PREFIX = 'ecothread.cache.'
const CURRENT_ITEM_KEY = 'ecothread.currentItem'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export async function getStatus(): Promise<ExtensionStatus> {
  const got = await chrome.storage.local.get(STATUS_KEY)
  const s = got[STATUS_KEY] as ExtensionStatus | undefined
  return s ?? { enabled: true, last_toggled_at: Date.now() }
}

export async function setStatus(next: ExtensionStatus): Promise<void> {
  await chrome.storage.local.set({ [STATUS_KEY]: next })
}

function cacheKey(url: string): string {
  return CACHE_PREFIX + url
}

export async function getCached(url: string): Promise<CacheEntry | null> {
  const got = await chrome.storage.local.get(cacheKey(url))
  const entry = got[cacheKey(url)] as CacheEntry | undefined
  if (!entry) return null
  if (Date.now() - entry.cached_at > CACHE_TTL_MS) return null
  return entry
}

export async function setCached(item: ScrapedItem, breakdown: SustainabilityBreakdown): Promise<void> {
  const entry: CacheEntry = { item, breakdown, cached_at: Date.now() }
  await chrome.storage.local.set({ [cacheKey(item.url)]: entry })
}

export async function setCurrentItem(item: ScrapedItem | null): Promise<void> {
  if (item === null) await chrome.storage.local.remove(CURRENT_ITEM_KEY)
  else await chrome.storage.local.set({ [CURRENT_ITEM_KEY]: item })
}

export async function getCurrentItem(): Promise<ScrapedItem | null> {
  const got = await chrome.storage.local.get(CURRENT_ITEM_KEY)
  return (got[CURRENT_ITEM_KEY] as ScrapedItem | undefined) ?? null
}
