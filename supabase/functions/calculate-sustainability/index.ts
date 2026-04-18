import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SECONDHAND_RETAILERS = new Set(['depop', 'vinted', 'thredup', 'vestiaire', 'ebay', 'whatnot'])
const K2_MODEL_ID = 'LLM360/K2-Think'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { productId } = await req.json()

    if (!productId) {
      return new Response(
        JSON.stringify({ error: 'productId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Get product
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle()

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: `Product not found: ${productId}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return cached score if exists
    if (product.sustainability_score !== null && product.score_explanation !== null) {
      return new Response(JSON.stringify({
        score: product.sustainability_score,
        explanation: product.score_explanation,
        reasoning: product.score_explanation,
        comparison: buildComparison(product.sustainability_score),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 1: Dedalus brand audit
    const dedalus = await fetchDedalusBrandAudit(product.retailer, product.title)

    // Step 2: K2-Think scoring
    const ifmResult = await fetchIFMScore({
      title: product.title,
      description: product.description ?? '',
      retailer: product.retailer,
      isSecondhand: SECONDHAND_RETAILERS.has(product.retailer),
      brandRating: dedalus.brand_rating,
      certifications: dedalus.certifications,
      brandNotes: dedalus.notes,
    })

    // Step 3: Persist result
    await supabase
      .from('products')
      .update({
        sustainability_score: ifmResult.score,
        score_explanation: ifmResult.explanation,
      })
      .eq('id', productId)

    return new Response(JSON.stringify({
      score: ifmResult.score,
      explanation: ifmResult.explanation,
      reasoning: ifmResult.reasoning,
      comparison: buildComparison(ifmResult.score),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in calculate-sustainability:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Dedalus Labs brand audit
async function fetchDedalusBrandAudit(retailer: string, productTitle: string): Promise<any> {
  const apiKey = Deno.env.get('DEDALUS_API_KEY')
  const brand = extractBrand(productTitle)

  try {
    const res = await fetch('https://api.dedaluslabs.ai/v1/audit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand,
        retailer,
        sources: ['goodonyou.eco', 'bcorporation.net', 'fairlabor.org'],
      }),
    })

    if (!res.ok) {
      return { brand_rating: 'unknown', certifications: [], notes: '' }
    }

    return await res.json()
  } catch {
    return { brand_rating: 'unknown', certifications: [], notes: '' }
  }
}

// K2-Think reasoning and scoring
async function fetchIFMScore(input: any): Promise<any> {
  const apiKey = Deno.env.get('IFM_API_KEY')
  const endpoint = Deno.env.get('IFM_API_URL')

  // No IFM endpoint - use retailer heuristic
  if (!endpoint) return retailerFallback(input)

  const secondhandContext = input.isSecondhand
    ? 'This item is sold on a secondhand marketplace, which significantly reduces its carbon footprint compared to buying new.'
    : ''

  const systemPrompt = `You are a sustainable fashion expert. Reason through the product's sustainability factors step by step, then output a final JSON verdict.

Scoring guide:
- 70-100: Highly sustainable (secondhand, strong ethical brand, certified materials)
- 40-69: Moderately sustainable
- 0-39: Low sustainability

After your reasoning, output exactly one JSON object on its own line:
{"score": <0-100>, "explanation": "<one-sentence summary for a product card>", "reasoning": "<2-3 sentence detail for the product modal>"}`

  const userPrompt = `Product: ${input.title}
Description: ${input.description}
Retailer: ${input.retailer}
${secondhandContext}
Brand sustainability rating: ${input.brandRating}
Certifications: ${input.certifications.join(', ') || 'none found'}
Brand notes: ${input.brandNotes || 'none'}`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey ?? 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: K2_MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[IFM] K2-Think ${res.status}: ${body.slice(0, 200)} — using fallback`)
      return retailerFallback(input)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.warn('[IFM] K2-Think response missing content — using fallback')
      return retailerFallback(input)
    }

    const parsed = extractTrailingJson(content)
    return {
      score: parsed.score,
      explanation: parsed.explanation,
      reasoning: parsed.reasoning ?? parsed.explanation,
    }
  } catch (err) {
    console.warn('[IFM] K2-Think call errored — using fallback:', err)
    return retailerFallback(input)
  }
}

function retailerFallback(input: any): any {
  const score = input.isSecondhand ? 65 : 35
  return {
    score,
    explanation: input.isSecondhand
      ? 'Secondhand item — estimated sustainability based on reuse.'
      : 'New retail item — estimated sustainability based on category.',
    reasoning: 'Live K2-Think scoring unavailable; score estimated from retailer type.',
  }
}

function extractTrailingJson(text: string): any {
  const matches = text.match(/\{[^{}]*"score"[^{}]*\}/g)
  if (!matches || matches.length === 0) {
    throw new Error('K2-Think response missing JSON verdict')
  }
  return JSON.parse(matches[matches.length - 1])
}

function extractBrand(title: string): string {
  return title.split(' ')[0] ?? title
}

function buildComparison(score: number): string {
  if (score >= 70) return `saves ~${Math.round(score * 0.3)} kg CO₂ vs buying new`
  if (score >= 40) return `saves ~${Math.round(score * 0.15)} kg CO₂ vs buying new`
  return 'minimal CO₂ savings vs buying new'
}