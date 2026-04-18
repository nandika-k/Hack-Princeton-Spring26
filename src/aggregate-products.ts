import type { AggregateInput, Product } from './types/product'

const RETAILERS = [
  { name: 'depop',      domain: 'depop.com' },
  { name: 'vinted',     domain: 'vinted.com' },
  { name: 'ebay',       domain: 'ebay.com' },
  { name: 'thredup',    domain: 'thredup.com' },
  { name: 'vestiaire',  domain: 'vestiairecollective.com' },
  { name: 'whatnot',    domain: 'whatnot.com' },
]

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/** @expose */
export async function aggregateProducts(input: AggregateInput): Promise<Product[]> {
  const { query, retailers, page = 0 } = input
  const targets = retailers
    ? RETAILERS.filter(r => retailers.includes(r.name))
    : RETAILERS

  // Check cache first — return fresh rows without re-fetching
  const cacheThreshold = new Date(Date.now() - CACHE_TTL_MS).toISOString()
  const cached = await db.Product.findMany({
    where: {
      retailer: { in: targets.map(r => r.name) },
      last_updated: { gte: cacheThreshold },
    },
    limit: 20,
    offset: page * 20,
  })

  if (cached.length >= 10) return cached as Product[]

  // Fetch from Tavily in parallel, one request per retailer
  const tavilyKey = process.env.TAVILY_API_KEY
  const results = await Promise.allSettled(
    targets.map(retailer => fetchRetailer(query, retailer.domain, retailer.name, tavilyKey!))
  )

  const products: Product[] = results
    .filter((r): r is PromiseFulfilledResult<Product[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // Upsert into Product cache
  if (products.length > 0) {
    await db.Product.upsertMany(products.map(p => ({
      id: p.id,
      ...p,
      last_updated: new Date().toISOString(),
    })))
  }

  return products.slice(page * 20, (page + 1) * 20)
}

async function fetchRetailer(
  query: string,
  domain: string,
  retailerName: string,
  apiKey: string,
): Promise<Product[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: `${query} site:${domain}`,
      search_depth: 'basic',
      include_images: true,
      max_results: 10,
    }),
  })

  if (!res.ok) throw new Error(`Tavily error for ${domain}: ${res.status}`)

  const data = await res.json()
  return (data.results ?? []).map((item: any, i: number) => normalizeResult(item, retailerName, i))
}

function normalizeResult(item: any, retailer: string, index: number): Product {
  const externalId = encodeURIComponent(item.url ?? `${retailer}-${index}`)
  return {
    id: `${retailer}:${externalId}`,
    retailer,
    title: item.title ?? 'Untitled',
    description: item.content ?? '',
    price: extractPrice(item.content ?? ''),
    currency: 'USD',
    image_urls: item.images ?? [],
    product_url: item.url ?? '',
    sustainability_score: null,
    score_explanation: null,
  }
}

function extractPrice(text: string): number {
  const match = text.match(/\$(\d+(?:\.\d{2})?)/);
  return match ? parseFloat(match[1]) : 0
}
