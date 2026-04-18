import type { Product } from './types/product'
import { aggregateProducts } from './aggregate-products'
import { MOCK_PRODUCTS } from './lib/mockProducts'

const DEFAULT_QUERY = 'sustainable secondhand vintage clothing'
const PAGE_SIZE = 20

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

  // Primary path: live Tavily search
  try {
    const live = await aggregateProducts({ query, page })
    if (live.length > 0) return live
    // Empty result — fall through to mock so the feed isn't blank
    return mockPage(page)
  } catch (err) {
    console.warn('[getRecommendations] Tavily failed, falling back to mock:', err)
    return mockPage(page)
  }
}

function buildQuery(prefs: { style_tags: string[]; occasions: string[] } | null): string {
  if (!prefs || prefs.style_tags.length === 0) return DEFAULT_QUERY
  const parts = [
    ...prefs.style_tags,
    ...prefs.occasions.map(o => `${o} outfit`),
    'secondhand vintage clothing',
  ]
  return parts.slice(0, 4).join(' ')
}

function mockPage(page: number): Product[] {
  return MOCK_PRODUCTS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
}
