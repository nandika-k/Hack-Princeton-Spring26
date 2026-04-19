import { aggregateProducts } from './aggregate-products'
import { filterValidatedListings } from './lib/listingValidation'
import { buildRecommendationQuery } from './lib/recommendationQuery'
import type { Product } from './types/product'

/** @expose */
export async function getRecommendations(page: number = 0): Promise<Product[]> {
  const principal = getPrincipal()

  const profile = await db.Profile.findFirst({
    where: { user: { id: principal.id } },
  })

  const prefs = profile
    ? await db.StylePreference.findFirst({ where: { user: { id: profile.id } } })
    : null

  const query = buildRecommendationQuery(prefs)

  try {
    const live = await aggregateProducts({ query, page })
    return filterValidatedListings(live, '', null)
  } catch (err) {
    console.warn('[getRecommendations] live recommendations unavailable:', err)
    return []
  }
}

