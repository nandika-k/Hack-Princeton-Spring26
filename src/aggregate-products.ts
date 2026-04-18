import type { AggregateInput, Product } from './types/product'

const RETAILERS = [
  { name: 'depop',      domain: 'depop.com' },
  { name: 'vinted',     domain: 'vinted.com' },
  { name: 'ebay',       domain: 'ebay.com' },
  { name: 'thredup',    domain: 'thredup.com' },
  { name: 'vestiaire',  domain: 'vestiairecollective.com' },
  { name: 'whatnot',    domain: 'whatnot.com' },
]

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
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

/** @expose */
export async function aggregateProducts(input: AggregateInput): Promise<Product[]> {
  const { query, retailers, page = 0 } = input
  const targets = retailers && retailers.length > 0
    ? RETAILERS.filter(r => retailers.includes(r.name))
    : RETAILERS

  // Check cache first and return fresh rows without re-fetching.
  const cacheThreshold = new Date(Date.now() - CACHE_TTL_MS).toISOString()
  const cached = await db.Product.findMany({
    where: {
      retailer: { in: targets.map(r => r.name) },
      last_updated: { gte: cacheThreshold },
    },
    limit: 20,
    offset: page * 20,
  })

  if (cached.length >= 10) return cached as Product[]

  // Fetch from Tavily in parallel, one request per retailer.
  const tavilyKey = process.env.TAVILY_API_KEY
  const results = await Promise.allSettled(
    targets.map(retailer => fetchRetailer(query, retailer.domain, retailer.name, tavilyKey!))
  )

  const products: Product[] = results
    .filter((r): r is PromiseFulfilledResult<Product[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // Upsert into Product cache
  if (products.length > 0) {
    await db.Product.upsertMany(products.map(p => ({
      ...p,
      last_updated: new Date().toISOString(),
    })))
  }

  return products.slice(page * 20, (page + 1) * 20)
}

async function fetchRetailer(
  query: string,
  domain: string,
  retailerName: string,
  apiKey: string,
): Promise<Product[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: `${query} site:${domain}`,
      search_depth: 'basic',
      include_images: true,
      max_results: 10,
    }),
  })

  if (!res.ok) throw new Error(`Tavily error for ${domain}: ${res.status}`)

  const data = await res.json()
  return (data.results ?? [])
    .map((item: any, i: number) => normalizeResult(item, retailerName, i))
    .sort((left: Product, right: Product) => {
      const leftDirect = isLikelyListingUrl(left.product_url, retailerName) ? 1 : 0
      const rightDirect = isLikelyListingUrl(right.product_url, retailerName) ? 1 : 0
      return rightDirect - leftDirect
    })
}

function normalizeResult(item: any, retailer: string, index: number): Product {
  const sourceUrl = item.url ?? ''
  const resolvedUrl = isLikelyListingUrl(sourceUrl, retailer)
    ? sourceUrl
    : buildProductSearchUrl(retailer, item.title ?? 'secondhand clothing')
  const externalId = encodeURIComponent(sourceUrl || resolvedUrl || `${retailer}-${index}`)
  return {
    id: `${retailer}:${externalId}`,
    retailer,
    title: item.title ?? 'Untitled',
    description: item.content ?? '',
    price: extractPrice(item.content ?? ''),
    currency: 'USD',
    image_urls: item.images ?? [],
    product_url: resolvedUrl,
    sustainability_score: null,
    score_explanation: null,
    metadata: {
      lookup_url: resolvedUrl,
      source_url: sourceUrl || null,
      source_score: typeof item.score === 'number' ? item.score : null,
      url_quality: isLikelyListingUrl(sourceUrl, retailer) ? 'listing' : 'search_fallback',
    },
    last_updated: new Date().toISOString(),
  }
}

function extractPrice(text: string): number {
  const match = text.match(/\$(\d+(?:\.\d{2})?)/);
  return match ? parseFloat(match[1]) : 0
}

function buildProductSearchUrl(retailer: string, title: string): string {
  const domain = RETAILERS.find((entry) => entry.name === retailer)?.domain
  const searchTerms = title.trim() || `${retailer} secondhand clothing`
  const query = domain ? `site:${domain} "${searchTerms}"` : searchTerms

  return `https://www.google.com/search?${new URLSearchParams({ q: query }).toString()}`
}

function isLikelyListingUrl(rawUrl: string | null | undefined, retailer: string): boolean {
  if (!rawUrl) {
    return false
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  const retailerConfig = RETAILERS.find((entry) => entry.name === retailer)
  if (retailerConfig && !url.hostname.toLowerCase().includes(retailerConfig.domain)) {
    return false
  }

  const pathname = url.pathname.toLowerCase()
  const segments = pathname.split('/').filter(Boolean)

  if (LISTING_PATH_HINTS[retailer]?.some((hint) => pathname.includes(hint))) {
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
