import {
  classifyListingBucket,
  buildRetailerSearchQueries,
  extractListingImageUrls,
  extractRetailerListingPrice,
  filterValidatedListings,
  LISTING_SCRAPE_VERSION,
  matchesListingSearch,
  needsListingRefresh,
  normalizeListingCandidate,
} from './lib/listingValidation'
import {
  buildRetailerSearchPlan,
  type RetailerSearchPlan,
  type RetailerSearchQuery,
} from './lib/recommendationQuery'
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

type FetchedSearchResult = {
  product: Product
  bucket: RetailerSearchQuery['bucket']
  fallback: boolean
}

/** @expose */
export async function aggregateProducts(input: AggregateInput): Promise<Product[]> {
  const { query, retailers, page = 0 } = input
  const targets = retailers && retailers.length > 0
    ? RETAILERS.filter((retailer) => retailers.includes(retailer.name))
    : RETAILERS
  const searchPlans = new Map(
    targets.map((retailer) => [retailer.name, buildRetailerSearchPlan(query, retailer.name)]),
  )

  await ensureCacheCleanup()

  const cacheThreshold = new Date(Date.now() - CACHE_TTL_MS).toISOString()
  const cachedProducts = await collectValidCachedProducts(
    targets.map((retailer) => retailer.name),
    cacheThreshold,
    page,
    searchPlans,
  )
  const cachedPage = cachedProducts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (cachedPage.length === PAGE_SIZE) {
    return cachedPage
  }

  const tavilyKey = process.env.TAVILY_API_KEY
  if (!tavilyKey) {
    return cachedPage
  }

  const results = await Promise.allSettled(
    targets.map((retailer) => fetchRetailer(searchPlans.get(retailer.name)!, retailer.domain, retailer.name, tavilyKey)),
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
  searchPlan: RetailerSearchPlan,
  domain: string,
  retailerName: string,
  apiKey: string,
): Promise<Product[]> {
  const primaryQueries = searchPlan.liveQueries.filter((queryPlan) => !queryPlan.fallback)
  const primaryResults = await Promise.allSettled(
    primaryQueries.map((queryPlan) => fetchRetailerQuery(queryPlan, domain, retailerName, apiKey)),
  )

  const collectedResults = primaryResults
    .filter((result): result is PromiseFulfilledResult<FetchedSearchResult[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value)

  if (searchPlan.diversified && needsBottomFallback(collectedResults)) {
    const fallbackQueries = searchPlan.liveQueries.filter((queryPlan) => queryPlan.fallback)
    const fallbackResults = await Promise.allSettled(
      fallbackQueries.map((queryPlan) => fetchRetailerQuery(queryPlan, domain, retailerName, apiKey)),
    )

    collectedResults.push(
      ...fallbackResults
        .filter((result): result is PromiseFulfilledResult<FetchedSearchResult[]> => result.status === 'fulfilled')
        .flatMap((result) => result.value),
    )
  }

  return searchPlan.diversified
    ? balanceRetailerResults(collectedResults)
    : dedupeRetailerResults(collectedResults)
}

async function fetchRetailerQuery(
  queryPlan: RetailerSearchQuery,
  domain: string,
  retailerName: string,
  apiKey: string,
): Promise<FetchedSearchResult[]> {
  const searchQueries = buildRetailerSearchQueries(queryPlan.query, retailerName, domain)

  for (const searchQuery of searchQueries) {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: searchQuery,
        include_domains: [domain],
        include_raw_content: 'text',
        search_depth: 'basic',
        include_images: true,
        max_results: 20,
      }),
    })

    if (!res.ok) {
      throw new Error(`Tavily error for ${domain}: ${res.status}`)
    }

    const data = await res.json()
    const normalizedResults = (data.results ?? [])
      .map((item: Record<string, unknown>, index: number) => normalizeResult(item, retailerName, index))
      .filter((product: Product | null): product is Product => product !== null)
      .map((product: Product) => ({
        product,
        bucket: queryPlan.bucket,
        fallback: Boolean(queryPlan.fallback),
      }))

    if (normalizedResults.length > 0) {
      return normalizedResults
    }
  }

  return []
}

function normalizeResult(
  item: Record<string, unknown>,
  retailer: string,
  index: number,
): Product | null {
  const title = typeof item.title === 'string' ? item.title : 'Untitled'
  const description = typeof item.content === 'string' ? item.content : ''
  const rawContent = typeof item.raw_content === 'string' ? item.raw_content : ''
  const productUrl = typeof item.url === 'string' ? item.url : ''
  const extractedPrice = extractRetailerListingPrice(retailer, title, description, rawContent)
  const externalId = encodeURIComponent(String(productUrl || `${retailer}-${index}`))

  return normalizeListingCandidate<Product>(
    {
      id: `${retailer}:${externalId}`,
      retailer,
      title,
      description,
      price: extractedPrice.price,
      currency: extractedPrice.currency,
      image_urls: extractListingImageUrls({
        retailer,
        product_url: productUrl,
        image_urls: Array.isArray(item.images)
          ? item.images.filter((image): image is string => typeof image === 'string')
          : [],
        title,
        description,
        raw_content: rawContent,
      }),
      product_url: productUrl,
      sustainability_score: null,
      score_explanation: null,
      metadata: { scrape_version: LISTING_SCRAPE_VERSION },
      last_updated: new Date().toISOString(),
    },
    retailer,
  )
}

async function collectValidCachedProducts(
  retailers: string[],
  cacheThreshold: string,
  page: number,
  searchPlans: Map<string, RetailerSearchPlan>,
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
      if (!normalized || needsListingRefresh(product)) {
        continue
      }

      const searchPlan = searchPlans.get(normalized.retailer)
      if (
        searchPlan?.diversified &&
        !searchPlan.cacheQueries.some((searchQuery) => matchesListingSearch(normalized, searchQuery))
      ) {
        continue
      }

      const key = normalized.product_url ?? normalized.id
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

function dedupeRetailerResults(results: FetchedSearchResult[]): Product[] {
  const deduped = new Map<string, Product>()

  for (const result of results) {
    const key = result.product.product_url ?? result.product.id
    if (!deduped.has(key)) {
      deduped.set(key, result.product)
    }
  }

  return Array.from(deduped.values())
}

function balanceRetailerResults(results: FetchedSearchResult[]): Product[] {
  const topProducts: Product[] = []
  const bottomProducts: Product[] = []
  const overflowProducts: Product[] = []
  const seenKeys = new Set<string>()

  for (const result of results) {
    const key = result.product.product_url ?? result.product.id
    if (seenKeys.has(key)) {
      continue
    }

    seenKeys.add(key)
    const classifiedBucket = classifyListingBucket(result.product)
    const bucket = classifiedBucket ?? (result.bucket === 'general' ? null : result.bucket)

    if (bucket === 'top') {
      topProducts.push(result.product)
      continue
    }

    if (bucket === 'bottom') {
      bottomProducts.push(result.product)
      continue
    }

    overflowProducts.push(result.product)
  }

  const balancedProducts: Product[] = []
  let topIndex = 0
  let bottomIndex = 0

  while (topIndex < topProducts.length || bottomIndex < bottomProducts.length) {
    if (topIndex < topProducts.length) {
      balancedProducts.push(topProducts[topIndex])
      topIndex += 1
    }

    if (bottomIndex < bottomProducts.length) {
      balancedProducts.push(bottomProducts[bottomIndex])
      bottomIndex += 1
    }
  }

  return [...balancedProducts, ...overflowProducts]
}

function needsBottomFallback(results: FetchedSearchResult[]): boolean {
  const seenKeys = new Set<string>()
  let bottomCount = 0

  for (const result of results) {
    const key = result.product.product_url ?? result.product.id
    if (seenKeys.has(key)) {
      continue
    }

    seenKeys.add(key)
    const classifiedBucket = classifyListingBucket(result.product)
    const bucket = classifiedBucket ?? (result.bucket === 'general' ? null : result.bucket)

    if (bucket === 'bottom') {
      bottomCount += 1
    }
  }

  return bottomCount < 4
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
