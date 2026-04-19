import type { ScrapedItem } from '../../types/item'
import { extractFiberFromDom, extractFiberFromText, validateFiberValue } from '../extract/fibers'
import { extractOriginFromDom } from '../extract/origin'

const GENERIC_TITLES = new Set(['vinted', 'loading', ''])

export function scrapeVinted(): ScrapedItem | null {
  if (!/vinted\.(com|co\.uk|fr|de|it|es|nl|pl)/i.test(location.hostname)) return null

  const rawTitle =
    document.querySelector('[data-testid="item-page-heading"]')?.textContent?.trim() ??
    document.querySelector('h1')?.textContent?.trim()
  const title = rawTitle && !GENERIC_TITLES.has(rawTitle.toLowerCase()) ? rawTitle : undefined
  if (!title) return null

  const priceText =
    document.querySelector('[data-testid="item-price"]')?.textContent?.trim() ??
    document.querySelector('[data-testid*="price" i]')?.textContent?.trim()
  const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '')) : undefined
  const currency =
    priceText?.includes('£') ? 'GBP'
    : priceText?.includes('€') ? 'EUR'
    : 'USD'

  const image =
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ??
    document.querySelector<HTMLImageElement>('[data-testid="item-photo"] img')?.src

  const description =
    document.querySelector('[itemprop="description"]')?.textContent?.trim() ??
    document.querySelector('[data-testid*="description" i]')?.textContent?.trim() ??
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ??
    undefined

  const brand = cleanBrand(
    findBrand() ??
    findLabelValue(['Brand', 'Marque', 'Marka', 'Marca', 'Merk']),
  )

  const labeledMaterial = findLabelValue([
    'Material', 'Materials', 'Composition', 'Fabric', 'Skład', 'Matière', 'Materiale',
  ])
  const material =
    firstValidFiber([labeledMaterial, title, description]) ??
    extractFiberFromDom(document)?.value

  const origin =
    findLabelValue(['Origin', 'Made in', 'Country', 'Pays d\'origine']) ??
    extractOriginFromDom(document) ??
    undefined

  return {
    url: location.href,
    retailer: location.hostname.replace(/^www\./, ''),
    title,
    brand,
    price: Number.isFinite(price) ? price : undefined,
    currency,
    image_url: image ?? undefined,
    description,
    material,
    origin,
    scraped_at: Date.now(),
  }
}

function findBrand(): string | undefined {
  const direct =
    document.querySelector('[data-testid="item-details--brand"] a')?.textContent?.trim() ??
    document.querySelector('[data-testid="item-details--brand"]')?.textContent?.trim() ??
    document.querySelector('a[href*="/brand/"]')?.textContent?.trim() ??
    document.querySelector('[itemprop="brand"]')?.textContent?.trim()
  return direct || undefined
}

function findLabelValue(labels: string[]): string | undefined {
  const lower = labels.map((l) => l.toLowerCase())
  const isLabel = (raw: string): boolean => {
    const t = raw.trim().toLowerCase().replace(/[:：*\s]+$/, '')
    return lower.some((l) => t === l || t.startsWith(l + ':') || t === l + ':')
  }

  const attrNodes = Array.from(
    document.querySelectorAll('[data-testid*="item-details" i], [class*="details-list" i] [class*="item" i]'),
  )
  for (const node of attrNodes) {
    const labelEl = node.querySelector('[class*="label" i], [class*="title" i], dt, strong, span:first-child')
    const labelText = labelEl?.textContent?.trim() ?? ''
    if (!isLabel(labelText)) continue
    const valueEl = node.querySelector('[class*="value" i], dd, a, span:last-child')
    const candidate = valueEl && valueEl !== labelEl ? valueEl.textContent?.trim() : undefined
    if (candidate) return cleanValue(candidate)
    const full = node.textContent?.trim() ?? ''
    const after = full.replace(labelText, '').trim().replace(/^[:：\-–—\s]+/, '')
    if (after) return cleanValue(after)
  }

  for (const dt of Array.from(document.querySelectorAll('dt'))) {
    if (!isLabel(dt.textContent ?? '')) continue
    const dd = dt.nextElementSibling
    if (dd && dd.tagName === 'DD') {
      const val = cleanValue(dd.textContent ?? '')
      if (val) return val
    }
  }

  return undefined
}

function cleanValue(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/^[:：\-–—\s]+/, '').trim().slice(0, 220)
}

const BRAND_STOPWORDS = new Set(['n/a', 'na', 'none', 'unbranded', 'no brand', 'unknown', '-', '—'])

function cleanBrand(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const v = raw.replace(/\s+/g, ' ').trim()
  if (!v || BRAND_STOPWORDS.has(v.toLowerCase())) return undefined
  if (v.length > 60) return undefined
  return v
}

function firstValidFiber(candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    if (!c) continue
    const parsed = extractFiberFromText(c)
    if (parsed && validateFiberValue(parsed.value)) return parsed.value
  }
  return undefined
}
