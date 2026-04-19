import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  fetchRetailerProducts,
  isProductListingVisible,
  prepareProductForUpsert,
  ProductRecord,
  RETAILERS,
} from '../_shared/product-scrape.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 20

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

    const tavilyKey = Deno.env.get('TAVILY_API_KEY')
    if (!tavilyKey) {
      return new Response(
        JSON.stringify({ error: 'TAVILY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const targets = Array.isArray(retailers) && retailers.length > 0
      ? RETAILERS.filter((retailer) => retailers.includes(retailer.name))
      : RETAILERS

    const now = new Date().toISOString()
    const results = await Promise.allSettled(
      targets.map((retailer) =>
        fetchRetailerProducts(query, retailer.domain, retailer.name, tavilyKey, now),
      ),
    )

    const products = results
      .filter((result): result is PromiseFulfilledResult<ProductRecord[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value)

    if (products.length === 0) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('products')
        .select('*')
        .in('retailer', targets.map((retailer) => retailer.name))
        .order('last_updated', { ascending: false })
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (fallbackError) {
        throw fallbackError
      }

      return new Response(JSON.stringify((fallback ?? []).filter((product) => isProductListingVisible(product as ProductRecord))), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('products')
      .select('*')
      .in('id', products.map((product) => product.id))

    if (existingError) {
      throw existingError
    }

    const existingById = new Map<string, ProductRecord>(
      (existingRows ?? []).map((product) => [product.id as string, product as ProductRecord]),
    )

    const productsToUpsert = products.map((product) =>
      prepareProductForUpsert(existingById.get(product.id) ?? null, product, now),
    )

    const { error: upsertError } = await supabase
      .from('products')
      .upsert(productsToUpsert.map((product) => ({
        ...product,
        metadata: product.metadata ?? null,
      })))

    if (upsertError) {
      throw upsertError
    }

    const pageProducts = productsToUpsert
      .filter((product) => isProductListingVisible(product))
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
