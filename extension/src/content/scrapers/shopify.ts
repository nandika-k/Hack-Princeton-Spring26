import type { ScrapedItem } from '../../types/item'

type ShopifyProduct = {
  title?: string
  vendor?: string
  price?: number | string
  currency?: string
  featured_image?: string
  description?: string
}

export function scrapeShopify(): ScrapedItem | null {
  const product = (window as unknown as { ShopifyAnalytics?: { meta?: { product?: ShopifyProduct } } })
    .ShopifyAnalytics?.meta?.product

  if (!product?.title) return null

  const priceNum = typeof product.price === 'number'
    ? product.price / 100
    : parseFloat(String(product.price ?? '').replace(/[^0-9.]/g, ''))

  return {
    url: location.href,
    retailer: location.hostname.replace(/^www\./, ''),
    title: product.title,
    brand: product.vendor,
    price: Number.isFinite(priceNum) ? priceNum : undefined,
    currency: product.currency ?? 'USD',
    image_url: product.featured_image,
    description: product.description,
    scraped_at: Date.now(),
  }
}
