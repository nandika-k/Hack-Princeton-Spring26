import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  buildRetailerSearchQuery,
  filterValidatedListings,
  normalizeListingCandidate,
  normalizeListingPrice,
} from '../../../src/lib/listingValidation.ts'

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

    await ensureCacheCleanup(supabase)

    const cacheThreshold = new Date(Date.now() - CACHE_TTL_MS).toISOString()
    const cachedProducts = await collectValidCachedProducts(supabase, targets.map((retailer) => retailer.name), cacheThreshold, page)
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
      targets.map((retailer) => fetchRetailer(query, retailer.domain, retailer.name, tavilyKey)),
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
  query: string,
  domain: string,
  retailerName: string,
  apiKey: string,
): Promise<any[]> {
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
    .filter((product: any) => product !== null)
}

function normalizeResult(item: Record<string, unknown>, retailer: string, index: number): any {
  const externalId = encodeURIComponent(String(item.url ?? `${retailer}-${index}`))
  return normalizeListingCandidate(
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
    },
    retailer,
  )
}

async function collectValidCachedProducts(
  supabase: ReturnType<typeof createClient>,
  retailers: string[],
  cacheThreshold: string,
  page: number,
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

    if (data.length < CACHE_SCAN_BATCH_SIZE) {
      break
    }

    offset += data.length
  }

  return validProducts
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

function extractPrice(text: string): number | null {
  const match = text.match(/\$(\d+(?:\.\d{2})?)/)
  return normalizeListingPrice(match ? parseFloat(match[1]) : null)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
