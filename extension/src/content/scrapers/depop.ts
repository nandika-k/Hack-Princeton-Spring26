import type { ScrapedItem } from '../../types/item'
import { extractFiberFromDom, extractFiberFromText, validateFiberValue } from '../extract/fibers'
import { extractOriginFromDom } from '../extract/origin'

const GENERIC_TITLES = new Set(['depop', 'vinted', 'loading', ''])

export function scrapeDepop(): ScrapedItem | null {
  if (!location.hostname.includes('depop.com')) return null

  const rawTitle =
    document.querySelector('[data-testid="product__title"]')?.textContent?.trim() ??
    document.querySelector('h1')?.textContent?.trim()
  const title = rawTitle && !GENERIC_TITLES.has(rawTitle.toLowerCase()) ? rawTitle : undefined
  if (!title) return null

  const { price, currency } = extractDepopPrice()

  const image =
    document.querySelector<HTMLImageElement>('[data-testid="product__image"] img')?.src ??
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content

  const description =
    document.querySelector('[data-testid="product__description"]')?.textContent?.trim() ??
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ??
    undefined

  const rawBrand = findLabelValue(['Brand', 'Marque', 'Marca'])
  const brand = cleanBrand(rawBrand)

  const labeledMaterial = findLabelValue([
    'Material', 'Materials', 'Fabric', 'Fabric Content',
    'Fiber Content', 'Fibre Content', 'Composition', 'Content', 'Made of',
  ])
  const material =
    firstValidFiber([
      labeledMaterial,
      title,
      description,
    ]) ??
    extractFiberFromDom(document)?.value

  const origin =
    findLabelValue(['Origin', 'Made in', 'Country']) ??
    extractOriginFromDom(document) ??
    undefined

  return {
    url: location.href,
    retailer: 'depop.com',
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

function extractDepopPrice(): { price: number | undefined; currency: string } {
  // 1. JSON-LD structured data — most stable across Depop redesigns
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(script.textContent ?? '')
      const offer = data?.offers
      if (offer?.price != null) {
        const p = parseFloat(String(offer.price))
        const c = offer.priceCurrency ?? 'USD'
        if (Number.isFinite(p)) return { price: p, currency: c }
      }
    } catch { /* skip malformed */ }
  }

  // 2. Aria-label on the price element (accessibility attribute, more stable than CSS class names)
  const ariaEl = document.querySelector<HTMLElement>('[aria-label="Price with fee"]')
  const priceText =
    ariaEl?.textContent?.trim() ??
    // 3. Legacy data-testid selectors (kept in case Depop restores them)
    document.querySelector('[data-testid="product__price"]')?.textContent?.trim() ??
    document.querySelector('[data-testid="product__priceDiscounted"]')?.textContent?.trim()

  if (!priceText) return { price: undefined, currency: 'USD' }

  const p = parseFloat(priceText.replace(/[^0-9.]/g, ''))
  const currency = priceText.includes('£') ? 'GBP' : priceText.includes('€') ? 'EUR' : 'USD'
  return { price: Number.isFinite(p) ? p : undefined, currency }
}

function findLabelValue(labels: string[]): string | undefined {
  const lower = labels.map((l) => l.toLowerCase())
  const isLabel = (raw: string): boolean => {
    const t = raw.trim().toLowerCase().replace(/[:：*\s]+$/, '')
    return lower.some((l) => t === l || t.startsWith(l + ':') || t === l + ':')
  }

  for (const dt of Array.from(document.querySelectorAll('dt'))) {
    if (!isLabel(dt.textContent ?? '')) continue
    const dd = dt.nextElementSibling
    if (dd && dd.tagName === 'DD') {
      const val = cleanValue(dd.textContent ?? '')
      if (val) return val
    }
  }

  const attrNodes = Array.from(
    document.querySelectorAll('[data-testid*="attribute" i], [data-testid*="productAttribute" i], [class*="attribute" i], [class*="Attribute" i]'),
  )
  for (const node of attrNodes) {
    const labelEl = node.querySelector('[class*="label" i], [class*="Label" i], dt, strong, b, span:first-child, p:first-child')
    const labelText = labelEl?.textContent?.trim() ?? ''
    if (!isLabel(labelText)) continue
    const valueEl = node.querySelector('[class*="value" i], [class*="Value" i], dd, a, span:last-child, p:last-child')
    const candidate = valueEl && valueEl !== labelEl ? valueEl.textContent?.trim() : undefined
    if (candidate) return cleanValue(candidate)
    const full = node.textContent?.trim() ?? ''
    const after = full.replace(labelText, '').trim().replace(/^[:：\-–—\s]+/, '')
    if (after) return cleanValue(after)
  }

  const all = Array.from(document.querySelectorAll('dt, th, span, p, div'))
  for (const el of all) {
    const txt = el.textContent?.trim() ?? ''
    if (txt.length > 60) continue
    if (!isLabel(txt)) continue
    const sib = el.nextElementSibling?.textContent?.trim()
    if (sib) return cleanValue(sib)
    const parentText = el.parentElement?.textContent?.trim()
    if (parentText) {
      const after = parentText.replace(txt, '').trim().replace(/^[:：\-–—\s]+/, '')
      if (after) return cleanValue(after)
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
