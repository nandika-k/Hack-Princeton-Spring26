import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { isProductListingVisible, PRODUCT_SCRAPE_VERSION, ProductRecord } from '../_shared/product-scrape.ts'
import {
  buildComparison,
  canReuseCachedScore,
  fetchDedalusBrandAudit,
  fetchIFMScore,
  PRODUCT_SCORE_VERSION,
  SECONDHAND_RETAILERS,
} from '../_shared/product-score.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { productId, product: providedProduct } = await req.json()

    if (!productId) {
      return new Response(
        JSON.stringify({ error: 'productId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: existingProduct, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle()

    if (productError) {
      throw productError
    }

    let product = existingProduct as ProductRecord | null

    if (!product && providedProduct) {
      const normalizedProduct = normalizeInputProduct(providedProduct, productId)
      const { data: insertedProduct, error: insertError } = await supabase
        .from('products')
        .upsert({
          ...normalizedProduct,
          metadata: normalizedProduct.metadata ?? null,
          last_updated: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (insertError) {
        throw insertError
      }

      product = insertedProduct as ProductRecord
    }

    if (!product) {
      return new Response(
        JSON.stringify({ error: `Product not found: ${productId}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!isProductListingVisible(product)) {
      return new Response(
        JSON.stringify({ error: 'Product is not a valid listing' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (canReuseCachedScore(product, PRODUCT_SCRAPE_VERSION)) {
      const score = product.sustainability_score ?? 0
      const explanation = product.score_explanation ?? 'Cached sustainability score.'
      return new Response(JSON.stringify({
        score,
        explanation,
        reasoning: explanation,
        comparison: buildComparison(score),
        carbon_kg: carbonKg(score),
        fabric_type: extractFabric(`${product.title} ${product.description ?? ''}`),
        condition: extractCondition(product.description ?? ''),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const dedalus = await fetchDedalusBrandAudit(product.retailer, product.brand, product.title)
    const ifmResult = await fetchIFMScore({
      title: product.title,
      description: product.description ?? '',
      retailer: product.retailer,
      brand: product.brand ?? null,
      productUrl: product.product_url,
      sourceDomain: product.source_domain ?? null,
      scrapeStatus: product.scrape_status ?? null,
      isSecondhand: SECONDHAND_RETAILERS.has(product.retailer),
      brandRating: dedalus.brand_rating,
      certifications: dedalus.certifications,
      brandNotes: dedalus.notes,
    })

    const { error: updateError } = await supabase
      .from('products')
      .update({
        sustainability_score: ifmResult.score,
        score_explanation: ifmResult.explanation,
        score_version: PRODUCT_SCORE_VERSION,
      })
      .eq('id', productId)

    if (updateError) {
      throw updateError
    }
    const score = ifmResult.score
    return new Response(JSON.stringify({
      score: ifmResult.score,
      explanation: ifmResult.explanation,
      reasoning: ifmResult.reasoning,
      comparison: buildComparison(score),
      carbon_kg: carbonKg(score),
      fabric_type: extractFabric(`${product.title} ${product.description ?? ''}`),
      condition: extractCondition(product.description ?? ''),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in calculate-sustainability:', error)
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

function normalizeInputProduct(product: Record<string, unknown>, productId: string): ProductRecord {
  return {
    id: productId,
    retailer: typeof product.retailer === 'string' ? product.retailer : 'unknown',
    brand: typeof product.brand === 'string' ? product.brand : null,
    title: typeof product.title === 'string' ? product.title : 'Untitled',
    description: typeof product.description === 'string' ? product.description : null,
    price: typeof product.price === 'number' ? product.price : null,
    currency: typeof product.currency === 'string' ? product.currency : null,
    image_urls: Array.isArray(product.image_urls) ? product.image_urls.filter((value): value is string => typeof value === 'string') : [],
    product_url: typeof product.product_url === 'string' ? product.product_url : '',
    source_search_url: typeof product.source_search_url === 'string' ? product.source_search_url : null,
    source_domain: typeof product.source_domain === 'string' ? product.source_domain : null,
    scrape_status: typeof product.scrape_status === 'string' ? product.scrape_status : 'pending',
    scrape_version: typeof product.scrape_version === 'number' ? product.scrape_version : PRODUCT_SCRAPE_VERSION,
    scraped_at: typeof product.scraped_at === 'string' ? product.scraped_at : null,
    sustainability_score: typeof product.sustainability_score === 'number' ? product.sustainability_score : null,
    score_explanation: typeof product.score_explanation === 'string' ? product.score_explanation : null,
    score_version: typeof product.score_version === 'number' ? product.score_version : 0,
    metadata: isRecord(product.metadata) ? product.metadata : null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function carbonKg(score: number): number {
  if (score >= 70) return Math.round(score * 0.3)
  if (score >= 40) return Math.round(score * 0.15)
  return 2
}

function extractFabric(text: string): string | null {
  const normalized = text.toLowerCase()
  const fabrics = ['cashmere', 'wool', 'silk', 'linen', 'cotton', 'denim', 'polyester', 'viscose', 'rayon', 'nylon', 'spandex', 'leather', 'suede', 'velvet', 'corduroy', 'satin', 'chiffon']
  for (const fabric of fabrics) {
    if (normalized.includes(fabric)) return fabric.charAt(0).toUpperCase() + fabric.slice(1)
  }
  return null
}

function extractCondition(text: string): string | null {
  const normalized = text.toLowerCase()
  if (normalized.includes('new with tags') || normalized.includes('nwt')) return 'New w/ Tags'
  if (normalized.includes('excellent') || normalized.includes('mint')) return 'Excellent'
  if (normalized.includes('good') || normalized.includes('great')) return 'Good'
  if (normalized.includes('fair') || normalized.includes('worn') || normalized.includes('used')) return 'Fair'
  return 'Good'
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
