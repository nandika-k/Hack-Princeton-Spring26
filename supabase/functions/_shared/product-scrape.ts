type RetailerConfig = {
  name: string
  domain: string
}

type TavilySearchResult = {
  url?: string
  title?: string
  content?: string
  raw_content?: string
  score?: number
  images?: string[]
}

type TavilyExtractResult = {
  url?: string
  raw_content?: string
  images?: string[]
  favicon?: string
}

type RankedCandidate = {
  retailer: string
  domain: string
  url: string
  title: string
  content: string
  rawContent: string
  score: number | null
  images: string[]
  rankingScore: number
}

type FieldSource = 'search' | 'extract' | 'derived'

type ProductFieldKey =
  | 'brand'
  | 'title'
  | 'description'
  | 'price'
  | 'currency'
  | 'image_urls'
  | 'product_url'
  | 'source_search_url'
  | 'source_domain'

export type ProductRecord = {
  id: string
  retailer: string
  brand?: string | null
  title: string
  description?: string | null
  price?: number | null
  currency?: string | null
  image_urls?: string[] | null
  product_url: string
  source_search_url?: string | null
  source_domain?: string | null
  scrape_status?: string | null
  scrape_version?: number | null
  scraped_at?: string | null
  sustainability_score?: number | null
  score_explanation?: string | null
  score_version?: number | null
  metadata?: Record<string, unknown> | null
  last_updated?: string | null
}

type BuiltProduct = ProductRecord & {
  metadata: Record<string, unknown>
}

export const PRODUCT_SCRAPE_VERSION = 2

export const RETAILERS: RetailerConfig[] = [
  { name: 'depop', domain: 'depop.com' },
  { name: 'vinted', domain: 'vinted.com' },
  { name: 'ebay', domain: 'ebay.com' },
  { name: 'thredup', domain: 'thredup.com' },
  { name: 'vestiaire', domain: 'vestiairecollective.com' },
  { name: 'whatnot', domain: 'whatnot.com' },
]

export const RETAILER_DOMAINS = Object.fromEntries(
  RETAILERS.map((retailer) => [retailer.name, retailer.domain]),
) as Record<string, string>

const MAX_SEARCH_RESULTS = 8
const MAX_EXTRACT_URLS = 2
const MAX_DESCRIPTION_LENGTH = 320

const GENERIC_PATH_SEGMENTS = new Set([
  'about',
  'blog',
  'brands',
  'browse',
  'catalog',
  'explore',
  'feed',
  'help',
  'home',
  'men',
  'products',
  'search',
  'sell',
  'seller',
  'shop',
  'stores',
  'women',
])

const LISTING_PATH_HINTS: Record<string, string[]> = {
  depop: ['/products/'],
  ebay: ['/itm/'],
  thredup: ['/product/'],
  vestiaire: ['/items/', '/women-', '/men-'],
  vinted: ['/items/'],
  whatnot: ['/listing/', '/live/'],
}

const LISTING_QUERY_KEYS = ['id', 'item', 'itemid', 'listingid', 'object_id', 'sku']
const GENERIC_TITLE_PATTERNS = [/^(home|shop|women|men|search|browse)$/i, /\b(sign in|log in)\b/i]
const BRAND_LABEL_PATTERNS = [
  /(?:^|\n)\s*(?:brand|designer)\s*[:|-]\s*([^\n|]{2,60})/i,
  /(?:^|\n)\s*(?:from the brand|label)\s*[:|-]\s*([^\n|]{2,60})/i,
]
const BY_BRAND_PATTERN = /\bby\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})\b/
const TITLE_SEPARATORS = ['|', ' - ', ' – ', ' — ', ' · ', ': ']

export async function fetchRetailerProducts(
  query: string,
  domain: string,
  retailerName: string,
  apiKey: string,
  now = new Date().toISOString(),
): Promise<ProductRecord[]> {
  const results = await searchRetailer(query, domain, apiKey)
  const candidates = rankCandidates(results, retailerName, domain)
  if (candidates.length === 0) {
    return []
  }

  const selectedCandidates = candidates.slice(0, MAX_EXTRACT_URLS)
  const extractedByUrl = await extractCandidateUrls(
    selectedCandidates.map((candidate) => candidate.url),
    apiKey,
  )

  return dedupeProducts(
    selectedCandidates
      .map((candidate, index) =>
        buildProductFromCandidate(candidate, extractedByUrl.get(candidate.url), {
          fallbackTitle: candidate.title,
          now,
          stableId: buildProductId(retailerName, candidate.url, `${retailerName}-${index}`),
          candidateUrls: candidates.map((entry) => entry.url),
        }),
      )
      .filter((product): product is ProductRecord => product !== null),
  )
}

export async function rescrapeProduct(
  product: ProductRecord,
  apiKey: string,
  now = new Date().toISOString(),
): Promise<ProductRecord | null> {
  const retailer = product.retailer.trim().toLowerCase()
  const domain = RETAILER_DOMAINS[retailer]
  if (!domain) {
    return null
  }

  const searchQuery = [product.brand, product.title].filter(Boolean).join(' ').trim() || product.title
  const results = await searchRetailer(searchQuery, domain, apiKey).catch(() => [])
  const preferredUrls = dedupeStrings([
    product.source_search_url ?? null,
    getMetadataString(product.metadata, 'selected_candidate_url'),
    getMetadataString(product.metadata, 'source_url'),
    isLikelyListingUrl(product.product_url, retailer) ? product.product_url : null,
  ])

  const preferredCandidates = preferredUrls
    .filter((url) => isLikelyListingUrl(url, retailer))
    .map((url, index) => ({
      retailer,
      domain,
      url,
      title: product.title || `Recovered ${retailer} listing ${index + 1}`,
      content: product.description ?? '',
      rawContent: '',
      score: null,
      images: product.image_urls ?? [],
      rankingScore: 1000 - index,
    }))

  const rankedCandidates = dedupeCandidates([
    ...preferredCandidates,
    ...rankCandidates(results, retailer, domain),
  ]).slice(0, MAX_EXTRACT_URLS)

  if (rankedCandidates.length === 0) {
    return null
  }

  const extractedByUrl = await extractCandidateUrls(
    rankedCandidates.map((candidate) => candidate.url),
    apiKey,
  )

  for (const candidate of rankedCandidates) {
    const built = buildProductFromCandidate(candidate, extractedByUrl.get(candidate.url), {
      fallbackTitle: product.title,
      now,
      stableId: product.id,
      candidateUrls: rankedCandidates.map((entry) => entry.url),
      priorBrand: product.brand ?? null,
      priorDescription: product.description ?? null,
      priorImages: product.image_urls ?? [],
    })

    if (built) {
      return built
    }
  }

  return null
}

export function prepareProductForUpsert(
  existing: ProductRecord | null | undefined,
  nextProduct: ProductRecord,
  now = new Date().toISOString(),
): ProductRecord {
  const normalized = {
    ...nextProduct,
    last_updated: now,
    scrape_version: nextProduct.scrape_version ?? PRODUCT_SCRAPE_VERSION,
    score_version: nextProduct.score_version ?? 0,
  }

  if (!existing) {
    return {
      ...normalized,
      sustainability_score: null,
      score_explanation: null,
      score_version: 0,
    }
  }

  if (!didCoreProductFieldsChange(existing, normalized)) {
    return {
      ...normalized,
      sustainability_score: existing.sustainability_score ?? normalized.sustainability_score ?? null,
      score_explanation: existing.score_explanation ?? normalized.score_explanation ?? null,
      score_version: existing.score_version ?? normalized.score_version ?? 0,
    }
  }

  return {
    ...normalized,
    sustainability_score: null,
    score_explanation: null,
    score_version: 0,
  }
}

export function didCoreProductFieldsChange(existing: ProductRecord, nextProduct: ProductRecord): boolean {
  const fields: ProductFieldKey[] = [
    'brand',
    'title',
    'description',
    'price',
    'currency',
    'image_urls',
    'product_url',
    'source_search_url',
    'source_domain',
  ]

  return fields.some((field) => !areValuesEqual(existing[field], nextProduct[field]))
}

export function isLikelyListingUrl(rawUrl: string | null | undefined, retailer: string): boolean {
  const url = parseUrl(rawUrl)
  if (!url) {
    return false
  }

  const normalizedRetailer = retailer.trim().toLowerCase()
  const expectedDomain = RETAILER_DOMAINS[normalizedRetailer]
  if (expectedDomain && !url.hostname.toLowerCase().includes(expectedDomain)) {
    return false
  }

  const pathname = url.pathname.toLowerCase()
  const segments = pathname.split('/').filter(Boolean)

  if (LISTING_PATH_HINTS[normalizedRetailer]?.some((hint) => pathname.includes(hint))) {
    return true
  }

  if (segments.length === 0) {
    return false
  }

  if (segments.length === 1 && GENERIC_PATH_SEGMENTS.has(segments[0])) {
    return false
  }

  if (segments.some((segment) => /\d/.test(segment))) {
    return true
  }

  if (segments.length >= 3 && segments[segments.length - 1].includes('-')) {
    return true
  }

  return LISTING_QUERY_KEYS.some((key) => url.searchParams.has(key))
}

async function searchRetailer(query: string, domain: string, apiKey: string): Promise<TavilySearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      include_domains: [domain],
      search_depth: 'advanced',
      chunks_per_source: 2,
      include_images: true,
      max_results: MAX_SEARCH_RESULTS,
      topic: 'general',
    }),
  })

  if (!response.ok) {
    throw new Error(`Tavily search failed for ${domain}: ${response.status}`)
  }

  const payload = await response.json()
  return Array.isArray(payload.results) ? payload.results : []
}

async function extractCandidateUrls(
  urls: string[],
  apiKey: string,
): Promise<Map<string, TavilyExtractResult>> {
  const uniqueUrls = dedupeStrings(urls).slice(0, MAX_EXTRACT_URLS)
  if (uniqueUrls.length === 0) {
    return new Map()
  }

  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      urls: uniqueUrls,
      extract_depth: 'advanced',
      format: 'markdown',
      include_images: true,
      timeout: 20,
    }),
  })

  if (!response.ok) {
    throw new Error(`Tavily extract failed: ${response.status}`)
  }

  const payload = await response.json()
  const results = Array.isArray(payload.results) ? payload.results : []
  const extractedByUrl = new Map<string, TavilyExtractResult>()

  for (const result of results) {
    if (typeof result?.url === 'string' && result.url.trim()) {
      extractedByUrl.set(result.url.trim(), result)
    }
  }

  return extractedByUrl
}

function rankCandidates(
  results: TavilySearchResult[],
  retailer: string,
  domain: string,
): RankedCandidate[] {
  return dedupeCandidates(
    results
      .map((result) => {
        const url = typeof result.url === 'string' ? result.url.trim() : ''
        if (!url || !isSameRetailerDomain(url, domain)) {
          return null
        }

        const title = typeof result.title === 'string' ? result.title.trim() : ''
        const content = typeof result.content === 'string' ? result.content.trim() : ''
        const rawContent = typeof result.raw_content === 'string' ? result.raw_content.trim() : ''
        const score = typeof result.score === 'number' ? result.score : null
        const images = Array.isArray(result.images) ? result.images.filter(isHttpUrl) : []
        const listing = isLikelyListingUrl(url, retailer)
        const itemSignals = countItemSignals(`${title}\n${content}\n${rawContent}`)

        let rankingScore = (score ?? 0) * 100
        rankingScore += listing ? 60 : -60
        rankingScore += itemSignals * 10
        rankingScore += images.length > 0 ? 8 : 0
        rankingScore += isGenericTitle(title) ? -12 : 10

        return {
          retailer,
          domain,
          url,
          title,
          content,
          rawContent,
          score,
          images,
          rankingScore,
        }
      })
      .filter((candidate): candidate is RankedCandidate => candidate !== null)
      .filter((candidate) => isLikelyListingUrl(candidate.url, retailer))
      .sort((left, right) => right.rankingScore - left.rankingScore),
  )
}

function buildProductFromCandidate(
  candidate: RankedCandidate,
  extracted: TavilyExtractResult | undefined,
  options: {
    stableId: string
    now: string
    fallbackTitle: string
    candidateUrls: string[]
    priorBrand?: string | null
    priorDescription?: string | null
    priorImages?: string[]
  },
): BuiltProduct | null {
  const extractedUrl = typeof extracted?.url === 'string' ? extracted.url.trim() : candidate.url
  const canonicalUrl = isLikelyListingUrl(extractedUrl, candidate.retailer)
    ? extractedUrl
    : isLikelyListingUrl(candidate.url, candidate.retailer)
      ? candidate.url
      : null

  if (!canonicalUrl) {
    return null
  }

  const extractedText = typeof extracted?.raw_content === 'string' ? extracted.raw_content : ''
  const title = deriveTitle(candidate.title, extractedText, options.fallbackTitle)
  const brandMatch = deriveBrand(extractedText, title, options.priorBrand ?? null)
  const description = deriveDescription(extractedText, candidate.content, options.priorDescription ?? null)
  const priceInfo = extractPriceInfo(candidate.title, candidate.content, extractedText)
  const imageUrls = dedupeStrings([
    ...(Array.isArray(extracted?.images) ? extracted.images.filter(isHttpUrl) : []),
    ...(candidate.images ?? []),
    ...(options.priorImages ?? []),
  ])

  const fieldSources: Record<string, FieldSource> = {
    title: title === cleanTitle(candidate.title) ? 'search' : 'extract',
    brand: brandMatch.source,
    description: description === (options.priorDescription ?? null) ? 'derived' : extractedText ? 'extract' : 'search',
    price: priceInfo.source,
    currency: priceInfo.source,
    image_urls: Array.isArray(extracted?.images) && extracted.images.length > 0 ? 'extract' : 'search',
  }

  return {
    id: options.stableId,
    retailer: candidate.retailer,
    brand: brandMatch.brand,
    title,
    description,
    price: priceInfo.price,
    currency: priceInfo.currency,
    image_urls: imageUrls,
    product_url: canonicalUrl,
    source_search_url: candidate.url,
    source_domain: candidate.domain,
    scrape_status: 'scraped',
    scrape_version: PRODUCT_SCRAPE_VERSION,
    scraped_at: options.now,
    sustainability_score: null,
    score_explanation: null,
    score_version: 0,
    metadata: {
      source_url: candidate.url,
      lookup_url: canonicalUrl,
      selected_candidate_url: candidate.url,
      candidate_urls: options.candidateUrls.slice(0, 5),
      source_score: candidate.score,
      url_quality: 'listing',
      extraction_source: extracted ? 'tavily_extract' : 'search_only',
      field_sources: fieldSources,
      favicon: extracted?.favicon ?? null,
    },
    last_updated: options.now,
  }
}

function deriveTitle(searchTitle: string, extractedText: string, fallbackTitle: string): string {
  const cleanedSearchTitle = cleanTitle(searchTitle)
  if (cleanedSearchTitle && !isGenericTitle(cleanedSearchTitle)) {
    return cleanedSearchTitle
  }

  const lines = splitContentLines(extractedText)
  const extractedTitle = lines.find((line) => !isGenericTitle(line) && line.length >= 6)
  if (extractedTitle) {
    return cleanTitle(extractedTitle)
  }

  return cleanTitle(fallbackTitle) || 'Untitled'
}

function deriveDescription(
  extractedText: string,
  searchContent: string,
  fallbackDescription: string | null,
): string | null {
  const extractedDescription = buildDescriptionFromText(extractedText)
  if (extractedDescription) {
    return extractedDescription
  }

  const cleanedSearchContent = collapseWhitespace(searchContent)
  if (cleanedSearchContent) {
    return truncate(cleanedSearchContent, MAX_DESCRIPTION_LENGTH)
  }

  return fallbackDescription ? truncate(collapseWhitespace(fallbackDescription), MAX_DESCRIPTION_LENGTH) : null
}

function deriveBrand(
  extractedText: string,
  title: string,
  priorBrand: string | null,
): { brand: string | null; source: FieldSource } {
  for (const pattern of BRAND_LABEL_PATTERNS) {
    const match = extractedText.match(pattern)
    const brand = cleanBrand(match?.[1] ?? null)
    if (brand) {
      return { brand, source: 'extract' }
    }
  }

  const byMatch = title.match(BY_BRAND_PATTERN) ?? extractedText.match(BY_BRAND_PATTERN)
  const byBrand = cleanBrand(byMatch?.[1] ?? null)
  if (byBrand) {
    return { brand: byBrand, source: 'derived' }
  }

  for (const separator of TITLE_SEPARATORS) {
    const parts = title.split(separator).map((part) => cleanBrand(part))
    const candidate = parts.find((part) => Boolean(part) && part!.split(' ').length <= 4)
    if (candidate) {
      return { brand: candidate, source: 'derived' }
    }
  }

  if (priorBrand) {
    return { brand: cleanBrand(priorBrand), source: 'derived' }
  }

  return { brand: null, source: 'derived' }
}

function extractPriceInfo(...texts: string[]): { price: number | null; currency: string | null; source: FieldSource } {
  for (const text of texts) {
    const normalized = collapseWhitespace(text)
    if (!normalized) {
      continue
    }

    const patterns: Array<{ regex: RegExp; currency: string | null }> = [
      { regex: /\$\s?(\d+(?:[.,]\d{2})?)/, currency: 'USD' },
      { regex: /USD\s?(\d+(?:[.,]\d{2})?)/i, currency: 'USD' },
      { regex: /£\s?(\d+(?:[.,]\d{2})?)/, currency: 'GBP' },
      { regex: /€\s?(\d+(?:[.,]\d{2})?)/, currency: 'EUR' },
    ]

    for (const pattern of patterns) {
      const match = normalized.match(pattern.regex)
      if (!match?.[1]) {
        continue
      }

      const price = Number.parseFloat(match[1].replace(',', '.'))
      if (Number.isFinite(price)) {
        return { price, currency: pattern.currency, source: 'extract' }
      }
    }
  }

  return { price: null, currency: null, source: 'derived' }
}

function buildDescriptionFromText(text: string): string | null {
  const lines = splitContentLines(text)
    .filter((line) => line.length >= 20)
    .filter((line) => !/^#{1,6}\s/.test(line))
    .filter((line) => !/^[-*]\s/.test(line))

  const description = lines.slice(0, 3).join(' ')
  return description ? truncate(description, MAX_DESCRIPTION_LENGTH) : null
}

function cleanTitle(value: string): string {
  let title = collapseWhitespace(value)
  if (!title) {
    return ''
  }

  title = title
    .replace(/\s+\|\s+(Depop|Vinted|eBay|thredUP|Vestiaire Collective|Whatnot).*$/i, '')
    .replace(/\s+-\s+(Depop|Vinted|eBay|thredUP|Vestiaire Collective|Whatnot).*$/i, '')
    .trim()

  return title
}

function cleanBrand(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const cleaned = collapseWhitespace(value)
    .replace(/^[#:|\-]+/, '')
    .replace(/\b(shop now|buy now|view all|women|men)\b.*$/i, '')
    .trim()

  if (!cleaned || cleaned.length < 2 || cleaned.length > 40) {
    return null
  }

  if (GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return null
  }

  return cleaned
}

function buildProductId(retailer: string, stableUrl: string, fallbackKey: string): string {
  const externalId = encodeURIComponent(stableUrl || fallbackKey)
  return `${retailer}:${externalId}`
}

function countItemSignals(text: string): number {
  const normalized = text.toLowerCase()
  let signals = 0

  if (/\$\s?\d/.test(text) || /USD\s?\d/i.test(text)) signals += 1
  if (/\bsize\b|\bus\b|\buk\b|\beu\b/.test(normalized)) signals += 1
  if (/\b(vintage|preloved|pre-loved|condition|nwt|used)\b/.test(normalized)) signals += 1
  if (/\b(dress|jeans|skirt|coat|bag|boots|shirt|blazer|jacket|sweater)\b/.test(normalized)) signals += 1

  return signals
}

function isGenericTitle(title: string): boolean {
  const cleaned = collapseWhitespace(title)
  if (!cleaned) {
    return true
  }

  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(cleaned))
}

function dedupeCandidates(candidates: RankedCandidate[]): RankedCandidate[] {
  const seen = new Set<string>()
  const deduped: RankedCandidate[] = []

  for (const candidate of candidates) {
    const key = candidate.url.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(candidate)
  }

  return deduped
}

function dedupeProducts(products: ProductRecord[]): ProductRecord[] {
  const seen = new Set<string>()
  return products.filter((product) => {
    if (seen.has(product.id)) {
      return false
    }

    seen.add(product.id)
    return true
  })
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue
    }

    seen.add(normalized.toLowerCase())
    deduped.push(normalized)
  }

  return deduped
}

function splitContentLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => collapseWhitespace(line))
    .filter(Boolean)
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1).trim()}...`
}

function isSameRetailerDomain(rawUrl: string, domain: string): boolean {
  const url = parseUrl(rawUrl)
  return Boolean(url && url.hostname.toLowerCase().includes(domain))
}

function isHttpUrl(rawUrl: string): boolean {
  return /^https?:\/\//i.test(rawUrl)
}

function getMetadataString(metadata: ProductRecord['metadata'], key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseUrl(rawUrl: string | null | undefined): URL | null {
  if (!rawUrl) {
    return null
  }

  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
  }

  return left === right
}
