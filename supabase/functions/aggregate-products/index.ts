import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, retailers, page = 0 } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const targets = retailers && retailers.length > 0
      ? RETAILERS.filter(r => retailers.includes(r.name))
      : RETAILERS

    // Check cache first
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_MS).toISOString()
    const { data: cached, error: cacheError } = await supabase
      .from('products')
      .select('*')
      .in('retailer', targets.map(r => r.name))
      .gte('last_updated', cacheThreshold)
      .range(page * 20, (page + 1) * 20 - 1)

    if (!cacheError && cached && cached.length >= 10) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch from Tavily
    const tavilyKey = Deno.env.get('TAVILY_API_KEY')
    if (!tavilyKey) {
      return new Response(
        JSON.stringify({ error: 'TAVILY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = await Promise.allSettled(
      targets.map(retailer => fetchRetailer(query, retailer.domain, retailer.name, tavilyKey))
    )

    const products = results
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)

    // Upsert products to cache
    if (products.length > 0) {
      const productsToUpsert = products.map(p => ({
        ...p,
        last_updated: new Date().toISOString(),
      }))

      await supabase.from('products').upsert(productsToUpsert)
    }

    const pageProducts = products.slice(page * 20, (page + 1) * 20)

    return new Response(JSON.stringify(pageProducts), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in aggregate-products:', error)
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      query: `${query} site:${domain}`,
      search_depth: 'basic',
      include_images: true,
      max_results: 10,
    }),
  })

  if (!res.ok) {
    throw new Error(`Tavily error for ${domain}: ${res.status}`)
  }

  const data = await res.json()
  return (data.results ?? [])
    .map((item: any, i: number) => normalizeResult(item, retailerName, i))
    .sort((left, right) => {
      const leftDirect = isLikelyListingUrl(left.product_url, retailerName) ? 1 : 0
      const rightDirect = isLikelyListingUrl(right.product_url, retailerName) ? 1 : 0
      return rightDirect - leftDirect
    })
}

function normalizeResult(item: any, retailer: string, index: number): any {
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
