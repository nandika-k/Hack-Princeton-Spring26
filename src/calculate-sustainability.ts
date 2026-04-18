import type { SustainabilityResult } from './types/product'

// Secondhand retailers get a baseline sustainability lift in the IFM prompt.
const SECONDHAND_RETAILERS = new Set(['depop', 'vinted', 'thredup', 'vestiaire', 'ebay', 'whatnot'])

/** @expose */
export async function calculateSustainability(productId: string): Promise<SustainabilityResult> {
  const product = await db.Product.findUnique({ where: { id: productId } })
  if (!product) throw new Error(`Product not found: ${productId}`)

  // Return cached score if already computed
  if (product.sustainability_score !== null && product.score_explanation !== null) {
    return {
      score: product.sustainability_score,
      explanation: product.score_explanation,
      reasoning: product.score_explanation,
      comparison: buildComparison(product.sustainability_score),
    }
  }

  // Step 1 — Dedalus Labs: real-time brand sustainability audit
  const dedalus = await fetchDedalusBrandAudit(product.retailer, product.title)

  // Step 2 — IFM (K2): reason over brand data and generate score
  const ifmResult = await fetchIFMScore({
    title: product.title,
    description: product.description ?? '',
    retailer: product.retailer,
    isSecondhand: SECONDHAND_RETAILERS.has(product.retailer),
    brandRating: dedalus.brand_rating,
    certifications: dedalus.certifications,
    brandNotes: dedalus.notes,
  })

  // Step 3 — Persist result
  await db.Product.update({
    where: { id: productId },
    data: {
      sustainability_score: ifmResult.score,
      score_explanation: ifmResult.explanation,
    },
  })

  return {
    score: ifmResult.score,
    explanation: ifmResult.explanation,
    reasoning: ifmResult.reasoning,
    comparison: buildComparison(ifmResult.score),
  }
}

// ─── Dedalus Labs ────────────────────────────────────────────

type DedalusResult = {
  brand_rating: string
  certifications: string[]
  notes: string
}

async function fetchDedalusBrandAudit(retailer: string, productTitle: string): Promise<DedalusResult> {
  const apiKey = process.env.DEDALUS_API_KEY
  const brand = extractBrand(productTitle)

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
    // Graceful fallback — scoring continues without brand data
    return { brand_rating: 'unknown', certifications: [], notes: '' }
  }

  return res.json()
}

// ─── IFM K2-Think ────────────────────────────────────────────
// Model: https://huggingface.co/LLM360/K2-Think
// 32B reasoning model (Qwen2.5-32B base) with extended chain-of-thought.
// Served via self-hosted vLLM (Modal/Runpod/Cerebras) — OpenAI-compatible.
// Set IFM_API_URL to your vLLM /v1/chat/completions endpoint.

const K2_MODEL_ID = 'LLM360/K2-Think'

type IFMInput = {
  title: string
  description: string
  retailer: string
  isSecondhand: boolean
  brandRating: string
  certifications: string[]
  brandNotes: string
}

type IFMOutput = {
  score: number
  explanation: string
  reasoning: string
}

async function fetchIFMScore(input: IFMInput): Promise<IFMOutput> {
  const apiKey = process.env.IFM_API_KEY
  const endpoint = process.env.IFM_API_URL
  if (!endpoint) throw new Error('IFM_API_URL not set — point to vLLM /v1/chat/completions')

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

  // OpenAI-compatible chat completions (vLLM-served K2-Think)
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
    throw new Error(`K2-Think call failed (${res.status}): ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('K2-Think response missing content')

  const parsed = extractTrailingJson(content)

  return {
    score: parsed.score,
    explanation: parsed.explanation,
    reasoning: parsed.reasoning ?? parsed.explanation,
  }
}

// K2-Think emits long chain-of-thought before the JSON verdict. Grab the
// last JSON object in the response.
function extractTrailingJson(text: string): { score: number; explanation: string; reasoning?: string } {
  const matches = text.match(/\{[^{}]*"score"[^{}]*\}/g)
  if (!matches || matches.length === 0) {
    throw new Error('K2-Think response missing JSON verdict')
  }
  return JSON.parse(matches[matches.length - 1])
}

// ─── Helpers ─────────────────────────────────────────────────

function extractBrand(title: string): string {
  // Titles often start with brand: "Levi's 501 jeans" → "Levi's"
  return title.split(' ')[0] ?? title
}

function buildComparison(score: number): string {
  if (score >= 70) return `saves ~${Math.round(score * 0.3)} kg CO₂ vs buying new`
  if (score >= 40) return `saves ~${Math.round(score * 0.15)} kg CO₂ vs buying new`
  return 'minimal CO₂ savings vs buying new'
}
