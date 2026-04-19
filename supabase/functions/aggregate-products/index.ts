import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
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
} from '../../../src/lib/listingValidation.ts'
import {
  buildRetailerSearchPlan,
  type RetailerSearchPlan,
  type RetailerSearchQuery,
} from '../../../src/lib/recommendationQuery.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  product: any
  bucket: RetailerSearchQuery['bucket']
  fallback: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, retailers, page = 0 } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const targets = retailers && retailers.length > 0
      ? RETAILERS.filter((retailer) => retailers.includes(retailer.name))
      : RETAILERS
    const searchPlans = new Map(
      targets.map((retailer) => [retailer.name, buildRetailerSearchPlan(query, retailer.name)]),
    )

    await ensureCacheCleanup(supabase)

    const cacheThreshold = new Date(Date.now() - CACHE_TTL_MS).toISOString()
    const cachedProducts = await collectValidCachedProducts(
      supabase,
      targets.map((retailer) => retailer.name),
      cacheThreshold,
      page,
      searchPlans,
    )
    const cachedPage = cachedProducts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    if (cachedPage.length === PAGE_SIZE) {
      return new Response(JSON.stringify(cachedPage), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tavilyKey = Deno.env.get('TAVILY_API_KEY')
    if (!tavilyKey) {
      return new Response(JSON.stringify(cachedPage), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.allSettled(
      targets.map((retailer) => fetchRetailer(searchPlans.get(retailer.name)!, retailer.domain, retailer.name, tavilyKey)),
    )

    const liveProducts = filterValidatedListings(
      results
        .filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled')
        .flatMap((result) => result.value),
      '',
      null,
    )

    if (liveProducts.length > 0) {
      await supabase.from('products').upsert(
        liveProducts.map((product) => ({
          ...product,
          last_updated: new Date().toISOString(),
        })),
      )
    }

    const pageProducts = filterValidatedListings([...cachedProducts, ...liveProducts], '', null)
      .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    return new Response(JSON.stringify(pageProducts), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in aggregate-products:', error)
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

async function fetchRetailer(
  searchPlan: RetailerSearchPlan,
  domain: string,
  retailerName: string,
  apiKey: string,
): Promise<any[]> {
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
      .filter((product: any) => product !== null)
      .map((product: any) => ({
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

function normalizeResult(item: Record<string, unknown>, retailer: string, index: number): any {
  const title = typeof item.title === 'string' ? item.title : 'Untitled'
  const description = typeof item.content === 'string' ? item.content : ''
  const rawContent = typeof item.raw_content === 'string' ? item.raw_content : ''
  const productUrl = typeof item.url === 'string' ? item.url : ''
  const extractedPrice = extractRetailerListingPrice(retailer, title, description, rawContent)
  const externalId = encodeURIComponent(String(productUrl || `${retailer}-${index}`))

  return normalizeListingCandidate(
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
    },
    retailer,
  )
}

async function collectValidCachedProducts(
  supabase: ReturnType<typeof createClient>,
  retailers: string[],
  cacheThreshold: string,
  page: number,
  searchPlans: Map<string, RetailerSearchPlan>,
): Promise<any[]> {
  const targetCount = (page + 1) * PAGE_SIZE
  const validProducts: any[] = []
  const seenKeys = new Set<string>()
  let offset = 0

  while (validProducts.length < targetCount) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .in('retailer', retailers)
      .gte('last_updated', cacheThreshold)
      .order('last_updated', { ascending: false })
      .range(offset, offset + CACHE_SCAN_BATCH_SIZE - 1)

    if (error) {
      throw error
    }

    if (!data?.length) {
      break
    }

    for (const product of data) {
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

    if (data.length < CACHE_SCAN_BATCH_SIZE) {
      break
    }

    offset += data.length
  }

  return validProducts
}

function dedupeRetailerResults(results: FetchedSearchResult[]): any[] {
  const deduped = new Map<string, any>()

  for (const result of results) {
    const key = result.product.product_url ?? result.product.id
    if (!deduped.has(key)) {
      deduped.set(key, result.product)
    }
  }

  return Array.from(deduped.values())
}

function balanceRetailerResults(results: FetchedSearchResult[]): any[] {
  const topProducts: any[] = []
  const bottomProducts: any[] = []
  const overflowProducts: any[] = []
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

  const balancedProducts: any[] = []
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

async function ensureCacheCleanup(supabase: ReturnType<typeof createClient>): Promise<void> {
  if (!cleanupPromise) {
    cleanupPromise = cleanupInvalidCachedProducts(supabase).catch((error) => {
      console.warn('[aggregate-products] cache cleanup failed:', error)
    })
  }

  await cleanupPromise
}

async function cleanupInvalidCachedProducts(supabase: ReturnType<typeof createClient>): Promise<void> {
  const invalidIds: string[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + CACHE_SCAN_BATCH_SIZE - 1)

    if (error) {
      throw error
    }

    if (!data?.length) {
      break
    }

    for (const product of data) {
      if (!normalizeListingCandidate(product)) {
        invalidIds.push(product.id)
      }
    }

    if (data.length < CACHE_SCAN_BATCH_SIZE) {
      break
    }

    offset += data.length
  }

  for (const chunk of chunked(invalidIds, 100)) {
    const { error } = await supabase.from('products').delete().in('id', chunk)
    if (error) {
      throw error
    }
  }
}

function chunked<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
