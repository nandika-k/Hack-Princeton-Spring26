import { aggregateProducts } from './aggregate-products'
import { filterValidatedListings } from './lib/listingValidation'
import type { Product } from './types/product'

const DEFAULT_QUERY = 'sustainable secondhand vintage clothing'

/** @expose */
export async function getRecommendations(page: number = 0): Promise<Product[]> {
  const principal = getPrincipal()

  const profile = await db.Profile.findFirst({
    where: { user: { id: principal.id } },
  })

  const prefs = profile
    ? await db.StylePreference.findFirst({ where: { user: { id: profile.id } } })
    : null

  const query = buildQuery(prefs)

  try {
    const live = await aggregateProducts({ query, page })
    return filterValidatedListings(live, '', null)
  } catch (err) {
    console.warn('[getRecommendations] live recommendations unavailable:', err)
    return []
  }
}

function buildQuery(prefs: { style_tags: string[]; occasions: string[] } | null): string {
  if (!prefs || prefs.style_tags.length === 0) {
    return DEFAULT_QUERY
  }

  const parts = [
    ...prefs.style_tags,
    ...prefs.occasions.map((occasion) => `${occasion} outfit`),
    'secondhand vintage clothing',
  ]

  return parts.slice(0, 4).join(' ')
}
