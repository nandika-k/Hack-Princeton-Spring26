import type { Product } from '../types/product'
import { NON_LISTING_SCRAPE_STATUS } from './product-scrape'

export const SECONDHAND_RETAILERS = new Set(['depop', 'vinted', 'thredup', 'vestiaire', 'ebay', 'whatnot'])
export const K2_MODEL_ID = 'LLM360/K2-Think'
export const PRODUCT_SCORE_VERSION = 1

export type DedalusResult = {
  brand_rating: string
  certifications: string[]
  notes: string
}

export type IFMInput = {
  title: string
  description: string
  retailer: string
  brand: string | null
  productUrl: string
  sourceDomain: string | null
  scrapeStatus: string | null
  isSecondhand: boolean
  brandRating: string
  certifications: string[]
  brandNotes: string
}

export type IFMOutput = {
  score: number
  explanation: string
  reasoning: string
}

export function canReuseCachedScore(product: Product, currentScrapeVersion: number): boolean {
  return (
    (product.scrape_status ?? '') !== NON_LISTING_SCRAPE_STATUS &&
    product.sustainability_score !== null &&
    product.score_explanation !== null &&
    (product.score_version ?? 0) === PRODUCT_SCORE_VERSION &&
    (product.scrape_version ?? 0) === currentScrapeVersion
  )
}

export async function fetchDedalusBrandAudit(
  retailer: string,
  brand: string | null | undefined,
  productTitle: string,
): Promise<DedalusResult> {
  const normalizedBrand = normalizeBrandForAudit(brand)
  if (!normalizedBrand) {
    return { brand_rating: 'unknown', certifications: [], notes: '' }
  }

  const apiKey = process.env.DEDALUS_API_KEY

  try {
    const response = await fetch('https://api.dedaluslabs.ai/v1/audit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand: normalizedBrand,
        retailer,
        product_title: productTitle,
        sources: ['goodonyou.eco', 'bcorporation.net', 'fairlabor.org'],
      }),
    })

    if (!response.ok) {
      return { brand_rating: 'unknown', certifications: [], notes: '' }
    }

    return (await response.json()) as DedalusResult
  } catch {
    return { brand_rating: 'unknown', certifications: [], notes: '' }
  }
}

export async function fetchIFMScore(input: IFMInput): Promise<IFMOutput> {
  const apiKey = process.env.IFM_API_KEY
  const endpoint = process.env.IFM_API_URL

  if (!endpoint) {
    return retailerFallback(input)
  }

  const systemPrompt = `You are a sustainable fashion expert. Return JSON only, with no markdown and no prose before or after it.

Required schema:
{"score": <integer 0-100>, "explanation": "<one sentence for a product card>", "reasoning": "<2-3 sentences for a product modal>"}

Scoring guide:
- 70-100: Highly sustainable (secondhand, strong ethical brand, certified materials)
- 40-69: Moderately sustainable
- 0-39: Low sustainability`

  const secondhandContext = input.isSecondhand
    ? 'This item is sold on a secondhand marketplace, which materially lowers impact versus buying new.'
    : 'This item appears to be sold as new inventory.'

  const userPrompt = `Product: ${input.title}
Description: ${input.description}
Retailer: ${input.retailer}
Brand: ${input.brand ?? 'unknown'}
Product URL: ${input.productUrl}
Source domain: ${input.sourceDomain ?? 'unknown'}
Scrape status: ${input.scrapeStatus ?? 'unknown'}
${secondhandContext}
Brand sustainability rating: ${input.brandRating}
Certifications: ${input.certifications.join(', ') || 'none found'}
Brand notes: ${input.brandNotes || 'none'}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey ?? 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: K2_MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1200,
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      return retailerFallback(input)
    }

    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return retailerFallback(input)
    }

    const parsed = extractJsonObject(content)
    return {
      score: clampScore(parsed.score),
      explanation: parsed.explanation,
      reasoning: parsed.reasoning ?? parsed.explanation,
    }
  } catch {
    return retailerFallback(input)
  }
}

export function buildComparison(score: number): string {
  if (score >= 70) return `saves ~${Math.round(score * 0.3)} kg CO2 vs buying new`
  if (score >= 40) return `saves ~${Math.round(score * 0.15)} kg CO2 vs buying new`
  return 'minimal CO2 savings vs buying new'
}

function retailerFallback(input: IFMInput): IFMOutput {
  const score = input.isSecondhand ? 65 : 35
  return {
    score,
    explanation: input.isSecondhand
      ? 'Secondhand item - estimated sustainability based on reuse.'
      : 'New retail item - estimated sustainability based on category.',
    reasoning: 'Live K2 scoring was unavailable, so this score is a retailer-based estimate.',
  }
}

function normalizeBrandForAudit(brand: string | null | undefined): string | null {
  const normalized = brand?.trim()
  return normalized ? normalized : null
}

function extractJsonObject(content: string): { score: number; explanation: string; reasoning?: string } {
  const stripped = content.replace(/```json|```/gi, '').trim()
  const start = stripped.indexOf('{')
  if (start < 0) {
    throw new Error('K2 response missing JSON object')
  }

  let depth = 0
  for (let index = start; index < stripped.length; index += 1) {
    const character = stripped[index]
    if (character === '{') depth += 1
    if (character === '}') depth -= 1
    if (depth === 0) {
      return JSON.parse(stripped.slice(start, index + 1))
    }
  }

  throw new Error('K2 response JSON object was incomplete')
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(value)))
}
