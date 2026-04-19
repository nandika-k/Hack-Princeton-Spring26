import type { Product } from '../types/product'

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

export type ListingUrlDecision = {
  isListing: boolean
  reason: string
}

export type ListingContentDecision = {
  isListing: boolean
  reason: string
  signalCount: number
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
  urlDecision: ListingUrlDecision
  rankingScore: number
}

type FieldSource = 'search' | 'extract' | 'derived'

type BuiltProduct = Product & {
  metadata: Record<string, unknown>
}

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

export const PRODUCT_SCRAPE_VERSION = 3
export const NON_LISTING_SCRAPE_STATUS = 'rejected_non_listing'

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
const REJECTED_FILE_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.zip', '.json', '.xml']
const URL_REJECT_MARKERS = [
  'download',
  'attachment',
  'asset',
  'file',
  'catalog',
  'lookbook',
  'brochure',
  'manual',
  'spec',
  'media',
  'size guide',
  'privacy',
  'terms',
  'returns',
]
const BRAND_LABEL_PATTERNS = [
  /(?:^|\n)\s*(?:brand|designer)\s*[:|-]\s*([^\n|]{2,60})/i,
  /(?:^|\n)\s*(?:from the brand|label)\s*[:|-]\s*([^\n|]{2,60})/i,
]
const BY_BRAND_PATTERN = /\bby\s+([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*){0,3})\b/
const TITLE_SEPARATORS = ['|', ' - ', ' – ', ' — ', ' · ', ': ']

const CONTENT_REJECT_PATTERNS = [
  /\b(?:download|attachment)\b.{0,24}\b(?:pdf|catalog|lookbook|brochure|manual)\b/i,
  /\b(?:catalog|lookbook|brochure|manual|press kit|media kit)\b/i,
  /\bprivacy policy\b/i,
  /\bcookie policy\b/i,
  /\bterms (?:and conditions|of service|of use)\b/i,
  /\breturns? (?:policy|center|portal)\b/i,
  /\bsize guide\b/i,
  /\bshipping policy\b/i,
]

export async function fetchRetailerProducts(
  query: string,
  domain: string,
  retailerName: string,
  apiKey: string,
  now = new Date().toISOString(),
): Promise<Product[]> {
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

  const builtProducts = selectedCandidates
    .map((candidate, index) =>
      buildProductFromCandidate(candidate, extractedByUrl.get(candidate.url), {
        fallbackTitle: candidate.title,
        now,
        stableId: buildProductId(retailerName, candidate.url, `${retailerName}-${index}`),
        candidateUrls: candidates.map((entry) => entry.url),
      }),
    )
    .filter((product): product is BuiltProduct => product !== null)

  return dedupeProducts(builtProducts)
}

export async function rescrapeProduct(
  product: Product,
  apiKey: string,
  now = new Date().toISOString(),
): Promise<Product | null> {
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
    .map((url) => ({ url, decision: classifyListingUrl(url, retailer) }))
    .filter(({ decision }) => decision.isListing)
    .map(({ url, decision }, index) => ({
      retailer,
      domain,
      url,
      title: product.title || `Recovered ${retailer} listing ${index + 1}`,
      content: product.description ?? '',
      rawContent: '',
      score: null,
      images: product.image_urls ?? [],
      urlDecision: decision,
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
  existing: Product | null | undefined,
  nextProduct: Product,
  now = new Date().toISOString(),
): Product {
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

export function didCoreProductFieldsChange(existing: Product, nextProduct: Product): boolean {
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

export function classifyListingUrl(rawUrl: string | null | undefined, retailer: string): ListingUrlDecision {
  const url = parseUrl(rawUrl)
  if (!url) {
    return { isListing: false, reason: 'invalid_url' }
  }

  const normalizedRetailer = retailer.trim().toLowerCase()
  const expectedDomain = RETAILER_DOMAINS[normalizedRetailer]
  if (expectedDomain && !url.hostname.toLowerCase().includes(expectedDomain)) {
    return { isListing: false, reason: 'wrong_retailer_domain' }
  }

  const pathname = url.pathname.toLowerCase()
  const normalizedPath = normalizeUrlFragment(pathname)
  const normalizedSearch = normalizeUrlFragment(url.search)
  const normalizedHash = normalizeUrlFragment(url.hash)
  const combinedUrlText = [normalizedPath, normalizedSearch, normalizedHash].filter(Boolean).join(' ')

  const matchedExtension = REJECTED_FILE_EXTENSIONS.find((extension) => pathname.endsWith(extension))
  if (matchedExtension) {
    return { isListing: false, reason: `rejected_file_extension:${matchedExtension}` }
  }

  const matchedMarker = URL_REJECT_MARKERS.find((marker) => containsUrlMarker(combinedUrlText, marker))
  if (matchedMarker) {
    return { isListing: false, reason: `rejected_url_marker:${matchedMarker.replace(/\s+/g, '_')}` }
  }

  const segments = normalizedPath.split('/').filter(Boolean)

  if (LISTING_PATH_HINTS[normalizedRetailer]?.some((hint) => pathname.includes(hint))) {
    return { isListing: true, reason: 'listing_path_hint' }
  }

  if (LISTING_QUERY_KEYS.some((key) => url.searchParams.has(key))) {
    return { isListing: true, reason: 'listing_query_key' }
  }

  if (segments.some((segment) => /\d/.test(segment))) {
    return { isListing: true, reason: 'numeric_path_segment' }
  }

  if (segments.length >= 3 && segments[segments.length - 1].includes('-')) {
    return { isListing: true, reason: 'listing_slug_path' }
  }

  if (segments.length === 0) {
    return { isListing: false, reason: 'missing_path_segments' }
  }

  if (segments.length === 1 && GENERIC_PATH_SEGMENTS.has(segments[0])) {
    return { isListing: false, reason: 'generic_path_segment' }
  }

  return { isListing: false, reason: 'no_listing_indicators' }
}

export function isLikelyListingUrl(rawUrl: string | null | undefined, retailer: string): boolean {
  return classifyListingUrl(rawUrl, retailer).isListing
}

export function validateListingPageContent(
  title: string,
  extractedText: string,
  fallbackContent = '',
): ListingContentDecision {
  const normalizedText = collapseWhitespace(extractedText)
  if (!normalizedText) {
    return { isListing: false, reason: 'missing_extracted_content', signalCount: 0 }
  }

  const normalizedTitle = cleanTitle(title)
  if (!normalizedTitle || isGenericTitle(normalizedTitle)) {
    return { isListing: false, reason: 'generic_title', signalCount: 0 }
  }

  const rejectPattern = CONTENT_REJECT_PATTERNS.find((pattern) => pattern.test(normalizedText))
  if (rejectPattern) {
    return { isListing: false, reason: `rejected_content_pattern:${rejectPattern.source}`, signalCount: 0 }
  }

  const signalCount = countItemSignals(`${normalizedTitle}\n${normalizedText}\n${fallbackContent}`)
  if (signalCount < 2) {
    return { isListing: false, reason: 'insufficient_item_signals', signalCount }
  }

  return { isListing: true, reason: 'listing_content_validated', signalCount }
}

export function isProductListingVisible(
  product: Pick<Product, 'product_url' | 'retailer' | 'scrape_status'>,
): boolean {
  if ((product.scrape_status ?? '').trim().toLowerCase() === NON_LISTING_SCRAPE_STATUS) {
    return false
  }

  return classifyListingUrl(product.product_url, product.retailer).isListing
}

export function buildProductSearchUrl(retailer: string, title: string): string {
  const domain = RETAILER_DOMAINS[retailer.trim().toLowerCase()]
  const searchTerms = title.trim() || `${retailer} secondhand clothing`
  const query = domain ? `site:${domain} "${searchTerms}"` : searchTerms

  return `https://www.google.com/search?${new URLSearchParams({ q: query }).toString()}`
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

  for (const [index, result] of results.entries()) {
    const requestedUrl = uniqueUrls[index]
    if (requestedUrl) {
      extractedByUrl.set(requestedUrl, result)
    }

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
        const urlDecision = classifyListingUrl(url, retailer)
        const itemSignals = countItemSignals(`${title}\n${content}\n${rawContent}`)

        let rankingScore = (score ?? 0) * 100
        rankingScore += urlDecision.isListing ? 60 : -60
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
          urlDecision,
          rankingScore,
        }
      })
      .filter((candidate): candidate is RankedCandidate => candidate !== null)
      .filter((candidate) => candidate.urlDecision.isListing)
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
  if (!extracted || typeof extracted.url !== 'string' || !extracted.url.trim()) {
    return null
  }

  const extractedUrl = extracted.url.trim()
  const extractedUrlDecision = classifyListingUrl(extractedUrl, candidate.retailer)
  if (!candidate.urlDecision.isListing || !extractedUrlDecision.isListing) {
    return null
  }

  const extractedText = typeof extracted?.raw_content === 'string' ? extracted.raw_content : ''
  const title = deriveTitle(candidate.title, extractedText, options.fallbackTitle)
  const contentDecision = validateListingPageContent(title, extractedText, candidate.content)
  if (!contentDecision.isListing) {
    return null
  }

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
    product_url: extractedUrl,
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
      lookup_url: extractedUrl,
      selected_candidate_url: candidate.url,
      candidate_urls: options.candidateUrls.slice(0, 5),
      source_score: candidate.score,
      url_quality: 'listing',
      source_url_reason: candidate.urlDecision.reason,
      resolved_url_reason: extractedUrlDecision.reason,
      content_validation_reason: contentDecision.reason,
      listing_signal_count: contentDecision.signalCount,
      extraction_source: 'tavily_extract',
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
  if (/\b(shipping|ships|delivery|dispatch|tracking)\b/.test(normalized)) signals += 1
  if (/\b(measurements?|material|fabric|item details?|sku|style number|pit to pit|inseam|waist)\b/.test(normalized)) signals += 1

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

function dedupeProducts(products: Product[]): Product[] {
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

function normalizeUrlFragment(value: string): string {
  return safeDecode(value)
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function containsUrlMarker(text: string, marker: string): boolean {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(^|[\\s/])${escapedMarker}([\\s/]|$)`, 'i').test(text)
}

function isSameRetailerDomain(rawUrl: string, domain: string): boolean {
  const url = parseUrl(rawUrl)
  return Boolean(url && url.hostname.toLowerCase().includes(domain))
}

function isHttpUrl(rawUrl: string): boolean {
  return /^https?:\/\//i.test(rawUrl)
}

function getMetadataString(metadata: Product['metadata'], key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const value = (metadata as Record<string, unknown>)[key]
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
