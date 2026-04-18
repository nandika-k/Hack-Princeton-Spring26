import type { ScrapedItem } from '../../types/item'

export function scrapeDepop(): ScrapedItem | null {
  if (!location.hostname.includes('depop.com')) return null

  const title =
    document.querySelector('[data-testid="product__title"]')?.textContent?.trim() ??
    document.querySelector('h1')?.textContent?.trim()
  if (!title) return null

  const priceText =
    document.querySelector('[data-testid="product__price"]')?.textContent?.trim() ??
    document.querySelector('[data-testid="product__priceDiscounted"]')?.textContent?.trim()
  const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '')) : undefined
  const currency = priceText?.match(/[A-Z]{3}|\$|£|€/)?.[0] === '£' ? 'GBP'
    : priceText?.includes('€') ? 'EUR'
    : 'USD'

  const image =
    document.querySelector<HTMLImageElement>('[data-testid="product__image"] img')?.src ??
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content

  const description =
    document.querySelector('[data-testid="product__description"]')?.textContent?.trim() ??
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ??
    undefined

  const brand = findLabelValue(['Brand'])
  const material = findLabelValue(['Material', 'Fabric'])
  const origin = findLabelValue(['Origin', 'Made in', 'Country'])

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

function findLabelValue(labels: string[]): string | undefined {
  const all = Array.from(document.querySelectorAll('dt, th, span, p'))
  for (const el of all) {
    const txt = el.textContent?.trim() ?? ''
    if (labels.some((l) => txt.toLowerCase().startsWith(l.toLowerCase()))) {
      const sib = el.nextElementSibling?.textContent?.trim()
      if (sib) return sib
      const parentText = el.parentElement?.textContent?.trim()
      if (parentText) {
        const after = parentText.replace(txt, '').trim().replace(/^[:\-\s]+/, '')
        if (after) return after
      }
    }
  }
  return undefined
}
