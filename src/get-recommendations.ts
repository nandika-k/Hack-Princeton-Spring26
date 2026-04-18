import type { Product } from './types/product'
import { aggregateProducts } from './aggregate-products'
import { MOCK_PRODUCTS } from './lib/mockProducts'

/** @expose */
export async function getRecommendations(page: number = 0): Promise<Product[]> {
  const principal = getPrincipal()

  // Find the user's Profile
  const profile = await db.Profile.findFirst({
    where: { user: { id: principal.id } },
  })

  if (!profile) return MOCK_PRODUCTS.slice(page * 20, (page + 1) * 20)

  // Look up style preferences
  const prefs = await db.StylePreference.findFirst({
    where: { user: { id: profile.id } },
  })

  // No preferences yet — return trending cached items
  if (!prefs || prefs.style_tags.length === 0) {
    const trending = await db.Product.findMany({
      orderBy: { last_updated: 'desc' },
      limit: 20,
      offset: page * 20,
    })
    return trending.length > 0 ? (trending as Product[]) : MOCK_PRODUCTS.slice(page * 20, (page + 1) * 20)
  }

  // Build a search query from the user's style tags and occasions
  const queryParts = [
    ...prefs.style_tags,
    ...prefs.occasions.map(o => `${o} outfit`),
    'secondhand vintage clothing',
  ]
  const query = queryParts.slice(0, 4).join(' ')

  return aggregateProducts({ query, page })
}
