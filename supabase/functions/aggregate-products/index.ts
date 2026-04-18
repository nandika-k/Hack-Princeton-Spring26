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

    const targets = retailers
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
      JSON.stringify({ error: error.message }),
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
  return (data.results ?? []).map((item: any, i: number) => normalizeResult(item, retailerName, i))
}

function normalizeResult(item: any, retailer: string, index: number): any {
  const externalId = encodeURIComponent(item.url ?? `${retailer}-${index}`)
  return {
    id: `${retailer}:${externalId}`,
    retailer,
    title: item.title ?? 'Untitled',
    description: item.content ?? '',
    price: extractPrice(item.content ?? ''),
    currency: 'USD',
    image_urls: item.images ?? [],
    product_url: item.url ?? '',
    sustainability_score: null,
    score_explanation: null,
  }
}

function extractPrice(text: string): number {
  const match = text.match(/\$(\d+(?:\.\d{2})?)/);
  return match ? parseFloat(match[1]) : 0
}