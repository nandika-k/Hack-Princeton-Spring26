import type { ScrapedItem } from '../../types/item'

export function scrapeGeneric(): ScrapedItem | null {
  const title =
    meta('og:title') ??
    meta('twitter:title') ??
    document.querySelector('h1')?.textContent?.trim() ??
    document.title

  const image = meta('og:image') ?? meta('twitter:image') ?? undefined
  const description = meta('og:description') ?? meta('description') ?? undefined
  const priceStr = meta('product:price:amount') ?? meta('og:price:amount')
  const currency = meta('product:price:currency') ?? meta('og:price:currency') ?? 'USD'
  const brand = meta('product:brand') ?? meta('og:brand') ?? undefined

  const ld = readJsonLd()
  const price = parsePrice(priceStr) ?? ld?.price
  const material = ld?.material ?? extractMaterialFromText(description ?? '')
  const origin = ld?.origin ?? extractOriginFromText(description ?? '')

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
    material,
    origin,
    scraped_at: Date.now(),
  }
}

function meta(name: string): string | undefined {
  const el =
    document.querySelector(`meta[property="${name}"]`) ??
    document.querySelector(`meta[name="${name}"]`)
  const v = el?.getAttribute('content')?.trim()
  return v || undefined
}

function readJsonLd(): { price?: number; brand?: string; material?: string; origin?: string } | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (const s of Array.from(scripts)) {
    try {
      const data = JSON.parse(s.textContent ?? '')
      const nodes = Array.isArray(data) ? data : [data]
      for (const node of nodes) {
        if (node?.['@type'] === 'Product' || (Array.isArray(node?.['@type']) && node['@type'].includes('Product'))) {
          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers
          return {
            price: parsePrice(offer?.price),
            brand: typeof node.brand === 'string' ? node.brand : node.brand?.name,
            material: node.material,
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

function parsePrice(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function extractMaterialFromText(text: string): string | undefined {
  const m = text.match(/(\d{1,3}%\s*(?:organic\s+)?(?:cotton|polyester|nylon|wool|silk|linen|hemp|tencel|lyocell|viscose|rayon|acrylic|elastane|spandex|cashmere)(?:\s*,?\s*\d{1,3}%\s*\w+)*)/i)
  return m?.[1]
}

function extractOriginFromText(text: string): string | undefined {
  const m = text.match(/made in\s+([A-Z][a-zA-Z ]{2,30})/i)
  return m?.[1]?.trim()
}
