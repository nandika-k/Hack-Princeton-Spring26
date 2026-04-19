import type { ScrapedItem } from '../../types/item'
import { validateFiberValue } from '../extract/fibers'
import { normalizeCountry } from '../extract/countries'

const ORIGIN_LABELS = ['country of origin', 'origin', 'made in', 'imported from']

function normalizeLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/[:：*\s]+$/, '')
}

function findAttrRow(labelNames: string[]): string | undefined {
  const rows = Array.from(document.querySelectorAll('[class*="attr-list-textli" i]'))
  for (const row of rows) {
    const nameEl = row.querySelector('[class*="attr-list-textname" i]')
    if (!nameEl) continue
    const label = normalizeLabel(nameEl.textContent ?? '')
    if (!labelNames.includes(label)) continue
    const valEl = row.querySelector('[class*="attr-list-textval" i]')
    const val = valEl?.textContent?.trim()
    if (val) return val
  }
  return undefined
}

export async function expandSheinDescription(): Promise<void> {
  const containers = Array.from(
    document.querySelectorAll('[name="ProductIntroDescription" i], [class*="common-entry__container" i]'),
  )
  for (const container of containers) {
    const btn = container.querySelector<HTMLElement>('button[aria-expanded="false"], [role="button"][aria-expanded="false"], .common-entry__top')
    if (btn) {
      try { btn.click() } catch { /* ignore */ }
    }
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  await new Promise((r) => setTimeout(r, 800))
}

export function scrapeShein(): ScrapedItem | null {
  if (!location.hostname.includes('shein.com')) return null

  const rawTitle =
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim() ??
    document.querySelector('h1')?.textContent?.trim() ??
    document.title
  const title = rawTitle && rawTitle.toLowerCase() !== 'shein' ? rawTitle : undefined
  if (!title) return null

  const image =
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ??
    document.querySelector<HTMLImageElement>('[class*="product-intro" i] img')?.src

  const description =
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ??
    undefined

  const priceStr =
    document.querySelector<HTMLMetaElement>('meta[property="product:price:amount"]')?.content ??
    document.querySelector<HTMLMetaElement>('meta[property="og:price:amount"]')?.content ??
    document.querySelector('[class*="product-intro__head-mainprice" i], [class*="product-price" i]')?.textContent?.trim()
  const price = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, '')) : undefined
  const currency =
    document.querySelector<HTMLMetaElement>('meta[property="product:price:currency"]')?.content ??
    (priceStr?.includes('£') ? 'GBP' : priceStr?.includes('€') ? 'EUR' : 'USD')

  const compositionRaw = findAttrRow(['composition'])
  const materialRaw = findAttrRow(['material'])

  let material: string | undefined
  if (compositionRaw && validateFiberValue(compositionRaw)) {
    material = compositionRaw
  } else if (materialRaw && validateFiberValue(materialRaw)) {
    material = materialRaw
  }

  const brandEl = document.querySelector('[class*="product-intro__head-brand" i], [class*="brand-name" i]')
  const brand = brandEl?.textContent?.trim() || undefined

  const originRaw = findAttrRow(ORIGIN_LABELS)
  const origin = originRaw ? (normalizeCountry(originRaw) ?? undefined) : undefined

  return {
    url: location.href,
    retailer: 'shein.com',
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
