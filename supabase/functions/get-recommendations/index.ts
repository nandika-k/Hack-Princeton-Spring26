import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { filterValidatedListings } from '../../../src/lib/listingValidation.ts'
import { buildRecommendationQuery } from '../../../src/lib/recommendationQuery.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
        auth: { persistSession: false },
      },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      const query = buildRecommendationQuery(null, search)
      const products = await fetchProducts(supabase, query, page, search, retailer)
      return new Response(JSON.stringify(products), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    let query = buildRecommendationQuery(null, search)

    if (profile) {
      const { data: prefs } = await supabase
        .from('style_preferences')
        .select('style_tags, occasions')
        .eq('profile_id', profile.id)
        .maybeSingle()

      query = buildRecommendationQuery(prefs, search)
    }

    const products = await fetchProducts(supabase, query, page, search, retailer)

    return new Response(JSON.stringify(products), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in get-recommendations:', error)
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

async function fetchProducts(
  supabase: ReturnType<typeof createClient>,
  query: string,
  page: number,
  search: string,
  retailer: string,
): Promise<any[]> {
  const retailerFilter = retailer && retailer !== 'all' ? retailer : null

  try {
    const { data, error } = await supabase.functions.invoke('aggregate-products', {
      body: {
        query,
        page,
        retailers: retailerFilter ? [retailerFilter] : undefined,
      },
    })

    if (error) {
      throw error
    }

    return filterProducts(Array.isArray(data) ? data : [], search, retailerFilter)
  } catch (err) {
    console.warn('[getRecommendations] live recommendations unavailable:', err)
    return []
  }
}

function filterProducts(products: any[], search: string, retailer: string | null): any[] {
  return filterValidatedListings(products, search, retailer)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
