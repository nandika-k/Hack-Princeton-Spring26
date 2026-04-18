import type { Product } from './types/product'
import { aggregateProducts } from './aggregate-products'

const DEFAULT_QUERY = 'sustainable secondhand vintage clothing'

/** @expose */
export async function getRecommendations(page: number = 0): Promise<Product[]> {
  const principal = getPrincipal()

  const profile = await db.Profile.findFirst({
    where: { user: { id: principal.id } },
  })

  // No profile yet — return a generic sustainable fashion query
  if (!profile) {
    return aggregateProducts({ query: DEFAULT_QUERY, page })
  }

  const prefs = await db.StylePreference.findFirst({
    where: { user: { id: profile.id } },
  })

  // No style preferences yet — generic query
  if (!prefs || prefs.style_tags.length === 0) {
    return aggregateProducts({ query: DEFAULT_QUERY, page })
  }

  // Build query from user's style tags + occasions
  const queryParts = [
    ...prefs.style_tags,
    ...prefs.occasions.map(o => `${o} outfit`),
    'secondhand vintage clothing',
  ]
  const query = queryParts.slice(0, 4).join(' ')

  return aggregateProducts({ query, page })
}
