import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { isProductListingVisible, type ProductRecord } from '../_shared/product-scrape.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_QUERY = 'sustainable secondhand vintage clothing'
const PAGE_SIZE = 20

// Mock products fallback data
const MOCK_PRODUCTS = [
  {
    id: 'depop:mock-001',
    retailer: 'depop',
    title: 'Y2K Butterfly Mini Skirt',
    description: 'Iconic 2000s butterfly print mini skirt, size S. Pink and lavender on white.',
    price: 28,
    currency: 'USD',
    image_urls: ['https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400'],
    product_url: 'https://depop.com/products/mock-001',
    sustainability_score: 82,
    score_explanation: 'Secondhand item from a verified seller; significant carbon savings vs. new.',
  },
  {
    id: 'vinted:mock-002',
    retailer: 'vinted',
    title: "Levi's 501 Vintage Straight Jeans",
    description: "90s Levi's 501. High waist, straight leg. Light wash. Size 27.",
    price: 45,
    currency: 'USD',
    image_urls: ['https://images.unsplash.com/photo-1542272454315-4c01d7abdf4a?w=400'],
    product_url: 'https://vinted.com/products/mock-002',
    sustainability_score: 78,
    score_explanation: "Vintage Levi's from ethical brand; pre-loved extends garment life.",
  },
  {
    id: 'thredup:mock-003',
    retailer: 'thredup',
    title: 'Dark Academia Plaid Blazer',
    description: 'Oversized black and white plaid blazer. Fully lined. Size M.',
    price: 34,
    currency: 'USD',
    image_urls: ['https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400'],
    product_url: 'https://thredup.com/products/mock-003',
    sustainability_score: 71,
    score_explanation: 'ThredUp-verified secondhand; blazer construction means long lifespan.',
  },
  {
    id: 'depop:mock-004',
    retailer: 'depop',
    title: 'Cottagecore Prairie Maxi Dress',
    description: 'Flowy floral maxi in sage green. Puff sleeves, smocked waist. Size S/M.',
    price: 38,
    currency: 'USD',
    image_urls: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400'],
    product_url: 'https://depop.com/products/mock-004',
    sustainability_score: 75,
    score_explanation: 'Cottagecore favorite - secondhand floral dress from indie seller.',
  },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const { page = 0, search = '', retailer = 'all' } = await req.json().catch(() => ({
      page: 0,
      search: '',
      retailer: 'all',
    }))
    const globalHeaders = authHeader ? { Authorization: authHeader } : undefined

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: globalHeaders ? { headers: globalHeaders } : undefined,
        auth: { persistSession: false }
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      // Not authenticated - return generic recommendations.
      const query = buildQuery(null, search)
      const products = await fetchProducts(supabase, query, page, search, retailer)
      return new Response(JSON.stringify(products), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get user profile and preferences.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    let query = buildQuery(null, search)

    if (profile) {
      const { data: prefs } = await supabase
        .from('style_preferences')
        .select('style_tags, occasions')
        .eq('profile_id', profile.id)
        .maybeSingle()

      query = buildQuery(prefs, search)
    }

    const products = await fetchProducts(supabase, query, page, search, retailer)

    return new Response(JSON.stringify(products), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in get-recommendations:', error)
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function fetchProducts(
  supabase: any,
  query: string,
  page: number,
  search: string,
  retailer: string,
): Promise<any[]> {
  const retailerFilter = retailer && retailer !== 'all' ? retailer : null

  try {
    // Call aggregate-products function.
    const { data, error } = await supabase.functions.invoke('aggregate-products', {
      body: {
        query,
        page,
        retailers: retailerFilter ? [retailerFilter] : undefined,
      }
    })

    if (error) throw error
    if (data && data.length > 0) return filterProducts(data, search, retailerFilter)

    // Empty result - fall back to mock.
    return mockPage(page, search, retailerFilter)
  } catch (err) {
    console.warn('[getRecommendations] Tavily failed, falling back to mock:', err)
    return mockPage(page, search, retailerFilter)
  }
}

function buildQuery(
  prefs: { style_tags: string[] | null; occasions: string[] | null } | null,
  search: string,
): string {
  const parts = [
    search.trim(),
    ...(prefs?.style_tags ?? []),
    ...(prefs?.occasions ?? []).map(o => `${o} outfit`),
    DEFAULT_QUERY,
  ].filter(Boolean)

  return parts.slice(0, 5).join(' ')
}

function mockPage(page: number, search: string, retailer: string | null): any[] {
  const filtered = filterProducts(MOCK_PRODUCTS, search, retailer)
  return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
}

function filterProducts(products: any[], search: string, retailer: string | null): any[] {
  const normalizedSearch = search.trim().toLowerCase()

  return products.filter((product) => {
    if (!isProductListingVisible(product as ProductRecord)) {
      return false
    }

    if (retailer && product.retailer !== retailer) {
      return false
    }

    if (!normalizedSearch) {
      return true
    }

    const haystack = `${product.title ?? ''} ${product.description ?? ''} ${product.brand ?? ''} ${product.retailer ?? ''}`.toLowerCase()
    return haystack.includes(normalizedSearch)
  })
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
