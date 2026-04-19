import {
  buildRetailerSearchQuery,
  filterValidatedListings,
  normalizeListingCandidate,
  normalizeListingPrice,
} from './lib/listingValidation'
import type { AggregateInput, Product } from './types/product'

const RETAILERS = [
  { name: 'depop', domain: 'depop.com' },
  { name: 'vinted', domain: 'vinted.com' },
  { name: 'ebay', domain: 'ebay.com' },
  { name: 'thredup', domain: 'thredup.com' },
  { name: 'vestiaire', domain: 'vestiairecollective.com' },
  { name: 'whatnot', domain: 'whatnot.com' },
]

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const PAGE_SIZE = 20
const CACHE_SCAN_BATCH_SIZE = 100

let cleanupPromise: Promise<void> | null = null

/** @expose */
export async function aggregateProducts(input: AggregateInput): Promise<Product[]> {
  const { query, retailers, page = 0 } = input
  const targets = retailers && retailers.length > 0
    ? RETAILERS.filter((retailer) => retailers.includes(retailer.name))
    : RETAILERS

  await ensureCacheCleanup()

  const cacheThreshold = new Date(Date.now() - CACHE_TTL_MS).toISOString()
  const cachedProducts = await collectValidCachedProducts(targets.map((retailer) => retailer.name), cacheThreshold, page)
  const cachedPage = cachedProducts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (cachedPage.length === PAGE_SIZE) {
    return cachedPage
  }

  const tavilyKey = process.env.TAVILY_API_KEY
  if (!tavilyKey) {
    return cachedPage
  }

  const results = await Promise.allSettled(
    targets.map((retailer) => fetchRetailer(query, retailer.domain, retailer.name, tavilyKey)),
  )

  const liveProducts = filterValidatedListings(
    results
      .filter((result): result is PromiseFulfilledResult<Product[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value),
    '',
    null,
  )

  if (liveProducts.length > 0) {
    await db.Product.upsertMany(
      liveProducts.map((product) => ({
        ...product,
        last_updated: new Date().toISOString(),
      })),
    )
  }

  const combined = filterValidatedListings([...cachedProducts, ...liveProducts], '', null)
  return combined.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
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
      query: buildRetailerSearchQuery(query, retailerName, domain),
      search_depth: 'basic',
      include_images: true,
      max_results: 20,
    }),
  })

  if (!res.ok) {
    throw new Error(`Tavily error for ${domain}: ${res.status}`)
  }

  const data = await res.json()
  return (data.results ?? [])
    .map((item: Record<string, unknown>, index: number) => normalizeResult(item, retailerName, index))
    .filter((product: Product | null): product is Product => product !== null)
}

function normalizeResult(
  item: Record<string, unknown>,
  retailer: string,
  index: number,
): Product | null {
  const externalId = encodeURIComponent(String(item.url ?? `${retailer}-${index}`))
  return normalizeListingCandidate<Product>(
    {
      id: `${retailer}:${externalId}`,
      retailer,
      title: typeof item.title === 'string' ? item.title : 'Untitled',
      description: typeof item.content === 'string' ? item.content : '',
      price: extractPrice(typeof item.content === 'string' ? item.content : ''),
      currency: 'USD',
      image_urls: Array.isArray(item.images)
        ? item.images.filter((image): image is string => typeof image === 'string')
        : [],
      product_url: typeof item.url === 'string' ? item.url : '',
      sustainability_score: null,
      score_explanation: null,
      metadata: null,
      last_updated: new Date().toISOString(),
    },
    retailer,
  )
}

async function collectValidCachedProducts(
  retailers: string[],
  cacheThreshold: string,
  page: number,
): Promise<Product[]> {
  const targetCount = (page + 1) * PAGE_SIZE
  const validProducts: Product[] = []
  const seenKeys = new Set<string>()
  let offset = 0

  while (validProducts.length < targetCount) {
    const batch = await db.Product.findMany({
      where: {
        retailer: { in: retailers },
        last_updated: { gte: cacheThreshold },
      },
      orderBy: { last_updated: 'desc' },
      limit: CACHE_SCAN_BATCH_SIZE,
      offset,
    })

    if (!batch.length) {
      break
    }

    for (const product of batch as Product[]) {
      const normalized = normalizeListingCandidate(product)
      if (!normalized) {
        continue
      }

      const key = normalized.id ?? normalized.product_url
      if (seenKeys.has(key)) {
        continue
      }

      seenKeys.add(key)
      validProducts.push(normalized)

      if (validProducts.length >= targetCount) {
        break
      }
    }

    if (batch.length < CACHE_SCAN_BATCH_SIZE) {
      break
    }

    offset += batch.length
  }

  return validProducts
}

async function ensureCacheCleanup(): Promise<void> {
  if (!cleanupPromise) {
    cleanupPromise = cleanupInvalidCachedProducts().catch((error) => {
      console.warn('[aggregateProducts] cache cleanup failed:', error)
    })
  }

  await cleanupPromise
}

async function cleanupInvalidCachedProducts(): Promise<void> {
  const invalidIds: string[] = []
  let offset = 0

  while (true) {
    const batch = await db.Product.findMany({
      orderBy: { id: 'asc' },
      limit: CACHE_SCAN_BATCH_SIZE,
      offset,
    })

    if (!batch.length) {
      break
    }

    for (const product of batch as Product[]) {
      if (!normalizeListingCandidate(product)) {
        invalidIds.push(product.id)
      }
    }

    if (batch.length < CACHE_SCAN_BATCH_SIZE) {
      break
    }

    offset += batch.length
  }

  for (const chunk of chunked(invalidIds, 100)) {
    await db.Product.deleteMany({
      where: {
        id: { in: chunk },
      },
    })
  }
}

function chunked<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function extractPrice(text: string): number | null {
  const match = text.match(/\$(\d+(?:\.\d{2})?)/)
  return normalizeListingPrice(match ? parseFloat(match[1]) : null)
}
