import { buildProductSearchUrl, isLikelyListingUrl } from './product-scrape'
import type { Product } from '../types/product'

export function resolveProductLookupUrl(product: Product): string {
  if (isLikelyListingUrl(product.product_url, product.retailer)) {
    return product.product_url
  }

  const metadataSourceUrl = getMetadataString(product.metadata, 'source_url')
  if (metadataSourceUrl && isLikelyListingUrl(metadataSourceUrl, product.retailer)) {
    return metadataSourceUrl
  }

  return buildProductSearchUrl(product.retailer, product.title)
}

function getMetadataString(metadata: Product['metadata'], key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const value = (metadata as Record<string, unknown>)[key]
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue ? trimmedValue : null
}
