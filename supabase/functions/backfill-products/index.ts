import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  prepareProductForUpsert,
  PRODUCT_SCRAPE_VERSION,
  ProductRecord,
  rescrapeProduct,
} from '../_shared/product-scrape.ts'
import {
  canReuseCachedScore,
  fetchDedalusBrandAudit,
  fetchIFMScore,
  PRODUCT_SCORE_VERSION,
  SECONDHAND_RETAILERS,
} from '../_shared/product-score.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-backfill-key',
}

const DEFAULT_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 100

type Cursor = {
  last_updated: string
  id: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!isAuthorized(req)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json().catch(() => ({}))
    const batchSize = clampBatchSize(body.batchSize)
    const cursor = parseCursor(body.cursor)
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

    const products = await fetchBatch(supabase, batchSize, cursor)
    if (products.length === 0) {
      return jsonResponse({
        processed: 0,
        rescored: 0,
        refreshedPins: 0,
        done: true,
        nextCursor: null,
        failures: [],
      })
    }

    const refreshedProducts: ProductRecord[] = []
    const failures: Array<{ productId: string; error: string }> = []
    let rescored = 0

    for (const product of products) {
      const now = new Date().toISOString()

      try {
        const rescanned = await rescrapeProduct(product, tavilyKey, now)
        const refreshed = rescanned
          ? prepareProductForUpsert(product, rescanned, now)
          : buildFailedRescrape(product, now)

        let finalProduct = refreshed
        if (!canReuseCachedScore(finalProduct, PRODUCT_SCRAPE_VERSION)) {
          const dedalus = await fetchDedalusBrandAudit(
            finalProduct.retailer,
            finalProduct.brand ?? null,
            finalProduct.title,
          )
          const ifmResult = await fetchIFMScore({
            title: finalProduct.title,
            description: finalProduct.description ?? '',
            retailer: finalProduct.retailer,
            brand: finalProduct.brand ?? null,
            productUrl: finalProduct.product_url,
            sourceDomain: finalProduct.source_domain ?? null,
            scrapeStatus: finalProduct.scrape_status ?? null,
            isSecondhand: SECONDHAND_RETAILERS.has(finalProduct.retailer),
            brandRating: dedalus.brand_rating,
            certifications: dedalus.certifications,
            brandNotes: dedalus.notes,
          })

          finalProduct = {
            ...finalProduct,
            sustainability_score: ifmResult.score,
            score_explanation: ifmResult.explanation,
            score_version: PRODUCT_SCORE_VERSION,
          }
          rescored += 1
        }

        refreshedProducts.push(finalProduct)
      } catch (error) {
        failures.push({
          productId: product.id,
          error: getErrorMessage(error),
        })
      }
    }

    if (refreshedProducts.length > 0) {
      const { error: upsertError } = await supabase
        .from('products')
        .upsert(refreshedProducts.map((product) => ({
          ...product,
          metadata: product.metadata ?? null,
          last_updated: product.last_updated ?? new Date().toISOString(),
        })))

      if (upsertError) {
        throw upsertError
      }
    }

    const refreshedPins = await refreshPins(supabase, refreshedProducts)
    const lastProduct = products[products.length - 1]

    return jsonResponse({
      processed: products.length,
      rescored,
      refreshedPins,
      done: products.length < batchSize,
      nextCursor: lastProduct ? { last_updated: lastProduct.last_updated ?? '', id: lastProduct.id } : null,
      failures,
    })
  } catch (error) {
    console.error('Error in backfill-products:', error)
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

function isAuthorized(req: Request): boolean {
  const configuredKey = Deno.env.get('BACKFILL_ADMIN_KEY')
  if (!configuredKey) {
    return false
  }

  const headerKey = req.headers.get('x-backfill-key')?.trim()
  return headerKey === configuredKey
}

async function fetchBatch(supabase: ReturnType<typeof createClient>, batchSize: number, cursor: Cursor | null) {
  let query = supabase
    .from('products')
    .select('*')
    .order('last_updated', { ascending: true })
    .order('id', { ascending: true })
    .limit(batchSize)

  if (cursor) {
    const quotedTimestamp = JSON.stringify(cursor.last_updated)
    const quotedId = JSON.stringify(cursor.id)
    query = query.or(
      `last_updated.gt.${quotedTimestamp},and(last_updated.eq.${quotedTimestamp},id.gt.${quotedId})`,
    )
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  return (data ?? []) as ProductRecord[]
}

async function refreshPins(
  supabase: ReturnType<typeof createClient>,
  products: ProductRecord[],
): Promise<number> {
  if (products.length === 0) {
    return 0
  }

  const productIds = products.map((product) => product.id)
  const productById = new Map(products.map((product) => [product.id, product]))
  const { data: pins, error: pinsError } = await supabase
    .from('pins')
    .select('id, product_id')
    .in('product_id', productIds)

  if (pinsError) {
    throw pinsError
  }

  let updated = 0
  for (const pin of pins ?? []) {
    const product = productById.get(pin.product_id as string)
    if (!product) {
      continue
    }

    const { error: updateError } = await supabase
      .from('pins')
      .update({
        product_data: product as never,
        sustainability_score: product.sustainability_score ?? null,
      } as never)
      .eq('id', pin.id)

    if (updateError) {
      throw updateError
    }

    updated += 1
  }

  return updated
}

function buildFailedRescrape(product: ProductRecord, now: string): ProductRecord {
  return {
    ...product,
    scrape_status: 'failed',
    scrape_version: PRODUCT_SCRAPE_VERSION,
    scraped_at: now,
    last_updated: now,
    metadata: {
      ...(isRecord(product.metadata) ? product.metadata : {}),
      backfill_error: 'Unable to recover a canonical listing URL',
    },
  }
}

function parseCursor(value: unknown): Cursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const cursor = value as Record<string, unknown>
  if (typeof cursor.last_updated !== 'string' || typeof cursor.id !== 'string') {
    return null
  }

  return { last_updated: cursor.last_updated, id: cursor.id }
}

function clampBatchSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE
  }

  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}
