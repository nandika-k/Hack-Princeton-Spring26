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

// ─── IFM (K2 model) ──────────────────────────────────────────

type IFMInput = {
  title: string
  description: string
  retailer: string
  isSecondhand: boolean
  brandRating: string
  certifications: string[]
  brandNotes: string
}

type IFMOutput = { score: number; explanation: string }

async function fetchIFMScore(input: IFMInput): Promise<IFMOutput> {
  const apiKey = process.env.IFM_API_KEY

  const secondhandContext = input.isSecondhand
    ? 'This item is sold on a secondhand marketplace, which significantly reduces its carbon footprint compared to buying new.'
    : ''

  const prompt = `You are a sustainable fashion expert. Score the sustainability of this clothing item from 0 to 100.

Product: ${input.title}
Description: ${input.description}
Retailer: ${input.retailer}
${secondhandContext}
Brand sustainability rating: ${input.brandRating}
Certifications: ${input.certifications.join(', ') || 'none found'}
Brand notes: ${input.brandNotes || 'none'}

Scoring guide:
- 70-100: Highly sustainable (secondhand, strong ethical brand, certified materials)
- 40-69: Moderately sustainable
- 0-39: Low sustainability

Respond with JSON only:
{
  "score": <integer 0-100>,
  "explanation": "<one plain-English sentence explaining the score>"
}`

  const res = await fetch('https://api.ifm.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'k2', prompt, response_format: 'json' }),
  })

  if (!res.ok) {
    // Fallback score for secondhand vs new
    const fallbackScore = input.isSecondhand ? 65 : 35
    return { score: fallbackScore, explanation: 'Score estimated based on retailer type.' }
  }

  const data = await res.json()
  const parsed = typeof data.content === 'string' ? JSON.parse(data.content) : data.content
  return { score: parsed.score, explanation: parsed.explanation }
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
