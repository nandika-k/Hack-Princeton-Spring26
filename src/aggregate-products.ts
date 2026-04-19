import { fetchRetailerProducts, prepareProductForUpsert, RETAILERS } from './lib/product-scrape'
import type { AggregateInput, Product } from './types/product'

const PAGE_SIZE = 20

/** @expose */
export async function aggregateProducts(input: AggregateInput): Promise<Product[]> {
  const { query, retailers, page = 0 } = input
  const targets = retailers && retailers.length > 0
    ? RETAILERS.filter((retailer) => retailers.includes(retailer.name))
    : RETAILERS

  const tavilyKey = process.env.TAVILY_API_KEY
  if (!tavilyKey) {
    throw new Error('TAVILY_API_KEY is not configured')
  }

  const now = new Date().toISOString()
  const results = await Promise.allSettled(
    targets.map((retailer) =>
      fetchRetailerProducts(query, retailer.domain, retailer.name, tavilyKey, now),
    ),
  )

  const products = results
    .filter((result): result is PromiseFulfilledResult<Product[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value)

  if (products.length === 0) {
    const fallback = await db.Product.findMany({
      where: { retailer: { in: targets.map((retailer) => retailer.name) } },
      orderBy: [{ last_updated: 'desc' }, { id: 'asc' }],
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })

    return fallback as Product[]
  }

  const existing = await db.Product.findMany({
    where: { id: { in: products.map((product) => product.id) } },
  })

  const existingById = new Map<string, Product>(
    (existing as Product[]).map((product) => [product.id, product]),
  )

  const upsertPayload = products.map((product) =>
    prepareProductForUpsert(existingById.get(product.id) ?? null, product, now),
  )

  await db.Product.upsertMany(upsertPayload)

  return upsertPayload.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
}
