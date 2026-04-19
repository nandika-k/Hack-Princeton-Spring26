import type { ScrapedItem } from '../../types/item'
import { extractFiberFromDom, extractFiberFromText } from '../extract/fibers'
import { extractOriginFromDom } from '../extract/origin'
import { normalizeCountry } from '../extract/countries'

export function scrapeGeneric(scope?: Element): ScrapedItem | null {
  const rawTitle =
    meta('og:title') ??
    meta('twitter:title') ??
    document.querySelector('h1')?.textContent?.trim() ??
    document.title
  const title = isMeaningfulTitle(rawTitle) ? rawTitle : undefined

  const image = meta('og:image') ?? meta('twitter:image') ?? undefined
  const description = meta('og:description') ?? meta('description') ?? undefined
  const priceStr = meta('product:price:amount') ?? meta('og:price:amount')
  const brand = meta('product:brand') ?? meta('og:brand') ?? undefined

  const ld = readJsonLd()
  const domPrice = extractPriceFromDom(scope) ?? extractPriceFromDom(document.body)
  const price = parsePrice(priceStr) ?? ld?.price ?? domPrice?.value
  const currency =
    meta('product:price:currency') ??
    meta('og:price:currency') ??
    ld?.currency ??
    domPrice?.currency ??
    'USD'

  const fiberFromLd = ld?.material ? { value: ld.material, source: 'jsonld' as const } : null
  const fiberFromScope = scope ? extractFiberFromDom(scope) : null
  const fiberFromDoc = extractFiberFromDom(document)
  const fiberFromDescription = description ? extractFiberFromText(description) : null
  const fiber = fiberFromLd ?? fiberFromScope ?? fiberFromDoc ?? fiberFromDescription

  const ldOrigin = ld?.origin ? normalizeCountry(ld.origin) : null
  const origin =
    ldOrigin ??
    (scope ? extractOriginFromDom(scope) : null) ??
    extractOriginFromDom(document) ??
    undefined

  if (!title) return null

  return {
    url: location.href,
    retailer: location.hostname.replace(/^www\./, ''),
    title,
    brand: brand ?? ld?.brand,
    price,
    currency,
    image_url: image,
    description,
    material: fiber?.value,
    origin: origin ?? undefined,
    scraped_at: Date.now(),
  }
}

const GENERIC_TITLES = new Set([
  'depop', 'vinted', 'zara', 'h&m', 'hm', 'macy\'s', 'macys', 'nordstrom',
  'asos', 'loading', '',
])

function isMeaningfulTitle(t: string | undefined): boolean {
  if (!t) return false
  const norm = t.trim().toLowerCase().replace(/[|\-–—].*$/, '').trim()
  if (norm.length < 3) return false
  return !GENERIC_TITLES.has(norm)
}

function meta(name: string): string | undefined {
  const el =
    document.querySelector(`meta[property="${name}"]`) ??
    document.querySelector(`meta[name="${name}"]`)
  const v = el?.getAttribute('content')?.trim()
  return v || undefined
}

function readJsonLd(): { price?: number; currency?: string; brand?: string; material?: string; origin?: string } | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const s of Array.from(scripts)) {
    try {
      const data = JSON.parse(s.textContent ?? '')
      const nodes = Array.isArray(data) ? data : [data]
      for (const node of nodes) {
        if (node?.['@type'] === 'Product' || (Array.isArray(node?.['@type']) && node['@type'].includes('Product'))) {
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers
          const priceFromOffer =
            parsePrice(offer?.price) ??
            parsePrice(offer?.lowPrice) ??
            parsePrice(offer?.highPrice) ??
            parsePrice(offer?.priceSpecification?.price) ??
            (Array.isArray(offer?.priceSpecification)
              ? parsePrice(offer.priceSpecification[0]?.price)
              : undefined)
          const currencyFromOffer =
            (typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : undefined) ??
            (typeof offer?.priceSpecification?.priceCurrency === 'string'
              ? offer.priceSpecification.priceCurrency
              : undefined)
          return {
            price: priceFromOffer,
            currency: currencyFromOffer,
            brand: typeof node.brand === 'string' ? node.brand : node.brand?.name,
            material: typeof node.material === 'string' ? node.material : undefined,
            origin: node.countryOfOrigin,
          }
        }
      }
    } catch {
      // skip malformed
    }
  }
  return null
}

const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₹': 'INR', '₩': 'KRW',
  'C$': 'CAD', 'A$': 'AUD', 'kr': 'SEK',
}

function detectCurrency(text: string): string | undefined {
  const iso = text.match(/\b(USD|EUR|GBP|CAD|AUD|JPY|INR|CHF|SEK|NOK|DKK|PLN|CNY|KRW)\b/)
  if (iso) return iso[1]
  for (const [sym, cur] of Object.entries(CURRENCY_SYMBOL_MAP)) {
    if (text.includes(sym)) return cur
  }
  return undefined
}

function extractPriceFromDom(root: Element | Document | null | undefined): { value: number; currency?: string } | null {
  if (!root) return null
  const selectors = [
    '[itemprop="price"]',
    '[data-testid*="price" i]',
    '[data-test*="price" i]',
    '[class*="price-value" i]',
    '[class*="current-price" i]',
    '[class*="sales-price" i]',
    '[class*="product-price" i]',
    '[class*="ProductPrice" i]',
    '[class*="Price" i]',
  ]
  for (const sel of selectors) {
    const nodes = Array.from(root.querySelectorAll(sel))
    for (const el of nodes) {
      const content = el.getAttribute('content') ?? ''
      const text = (content || el.textContent || '').trim()
      if (!text) continue
      if (/^(from|was|original|regular)/i.test(text)) continue
      const value = parsePrice(text)
      if (value !== undefined && value > 0) {
        return { value, currency: detectCurrency(text) }
      }
    }
  }
  return null
}

function parsePrice(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : undefined
}
