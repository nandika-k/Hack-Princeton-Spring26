import { PRODUCT_SCRAPE_VERSION } from './lib/product-scrape'
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

  if (canReuseCachedScore(product, PRODUCT_SCRAPE_VERSION)) {
    return {
      score: product.sustainability_score,
      explanation: product.score_explanation,
      reasoning: product.score_explanation,
      comparison: buildComparison(product.sustainability_score),
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

  return {
    score: ifmResult.score,
    explanation: ifmResult.explanation,
    reasoning: ifmResult.reasoning,
    comparison: buildComparison(ifmResult.score),
  }
}
