import { isProductListingVisible, PRODUCT_SCRAPE_VERSION } from './lib/product-scrape'
import {
  buildComparison,
  canReuseCachedScore,
  fetchDedalusBrandAudit,
  fetchIFMScore,
  PRODUCT_SCORE_VERSION,
  SECONDHAND_RETAILERS,
} from './lib/product-score'
import type { SustainabilityResult } from './types/product'

/** @expose */
export async function calculateSustainability(productId: string): Promise<SustainabilityResult> {
  const product = await db.Product.findUnique({ where: { id: productId } })
  if (!product) throw new Error(`Product not found: ${productId}`)
  if (!isProductListingVisible(product)) {
    throw new Error('Product is not a valid listing')
  }

  if (canReuseCachedScore(product, PRODUCT_SCRAPE_VERSION)) {
    const score = product.sustainability_score
    const text = `${product.title} ${product.description ?? ''}`.toLowerCase()

    return {
      score,
      explanation: product.score_explanation,
      reasoning: product.score_explanation,
      comparison: buildComparison(score),
      carbon_kg: carbonKg(score),
      fabric_type: extractFabric(text),
      condition: extractCondition(product.description ?? ''),
    }
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

  await db.Product.update({
    where: { id: productId },
    data: {
      sustainability_score: ifmResult.score,
      score_explanation: ifmResult.explanation,
      score_version: PRODUCT_SCORE_VERSION,
    },
  })

  const score = ifmResult.score
  const text = `${product.title} ${product.description ?? ''}`.toLowerCase()
  return {
    score,
    explanation: ifmResult.explanation,
    reasoning: ifmResult.reasoning,
    comparison: buildComparison(score),
    carbon_kg: carbonKg(score),
    fabric_type: extractFabric(text),
    condition: extractCondition(product.description ?? ''),
  }
}

function carbonKg(score: number): number {
  if (score >= 70) return Math.round(score * 0.3)
  if (score >= 40) return Math.round(score * 0.15)
  return 2
}

function extractFabric(text: string): string | null {
  const fabrics = ['cashmere', 'wool', 'silk', 'linen', 'cotton', 'denim', 'polyester', 'viscose', 'rayon', 'nylon', 'spandex', 'leather', 'suede', 'velvet', 'corduroy', 'satin', 'chiffon']
  for (const fabric of fabrics) {
    if (text.includes(fabric)) {
      return fabric.charAt(0).toUpperCase() + fabric.slice(1)
    }
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
