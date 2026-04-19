import type { Product } from '../types/product'

const RETAILER_DOMAINS: Record<string, string> = {
  depop: 'depop.com',
  ebay: 'ebay.com',
  thredup: 'thredup.com',
  vestiaire: 'vestiairecollective.com',
  vinted: 'vinted.com',
  whatnot: 'whatnot.com',
}

const GENERIC_PATH_SEGMENTS = new Set([
  'about',
  'blog',
  'brands',
  'browse',
  'catalog',
  'explore',
  'feed',
  'help',
  'home',
  'men',
  'products',
  'search',
  'sell',
  'seller',
  'shop',
  'stores',
  'women',
])

const LISTING_PATH_HINTS: Record<string, string[]> = {
  depop: ['/products/'],
  ebay: ['/itm/'],
  thredup: ['/product/'],
  vestiaire: ['/items/', '/women-', '/men-'],
  vinted: ['/items/'],
  whatnot: ['/listing/', '/live/'],
}

const LISTING_QUERY_KEYS = ['id', 'item', 'itemid', 'listingid', 'object_id', 'sku']

export function resolveProductLookupUrl(product: Product): string {
  const metadataLookupUrl = getMetadataString(product.metadata, 'lookup_url')
  if (metadataLookupUrl) {
    return metadataLookupUrl
  }

  const sourceUrl = getMetadataString(product.metadata, 'source_url')
  const directUrl = [product.product_url, sourceUrl].find((candidate) =>
    isLikelyListingUrl(candidate, product.retailer),
  )

  if (directUrl) {
    return directUrl
  }

  return buildProductSearchUrl(product.retailer, product.title)
}

export function isLikelyListingUrl(rawUrl: string | null | undefined, retailer: string): boolean {
  const url = parseUrl(rawUrl)
  if (!url) {
    return false
  }

  const normalizedRetailer = retailer.trim().toLowerCase()
  const expectedDomain = RETAILER_DOMAINS[normalizedRetailer]
  if (expectedDomain && !url.hostname.toLowerCase().includes(expectedDomain)) {
    return false
  }

  const pathname = url.pathname.toLowerCase()
  const segments = pathname.split('/').filter(Boolean)

  if (LISTING_PATH_HINTS[normalizedRetailer]?.some((hint) => pathname.includes(hint))) {
    return true
  }

  if (segments.length === 0) {
    return false
  }

  if (segments.length === 1 && GENERIC_PATH_SEGMENTS.has(segments[0])) {
    return false
  }

  if (segments.some((segment) => /\d/.test(segment))) {
    return true
  }

  if (segments.length >= 3 && segments[segments.length - 1].includes('-')) {
    return true
  }

  return LISTING_QUERY_KEYS.some((key) => url.searchParams.has(key))
}

function buildProductSearchUrl(retailer: string, title: string): string {
  const domain = RETAILER_DOMAINS[retailer.trim().toLowerCase()]
  const searchTerms = title.trim() || `${retailer} secondhand clothing`
  const query = domain ? `site:${domain} "${searchTerms}"` : searchTerms

  return `https://www.google.com/search?${new URLSearchParams({ q: query }).toString()}`
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

function parseUrl(rawUrl: string | null | undefined): URL | null {
  if (!rawUrl) {
    return null
  }

  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}
