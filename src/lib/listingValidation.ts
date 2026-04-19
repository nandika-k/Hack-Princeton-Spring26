export type ListingCandidate = {
  id?: string
  retailer?: string | null
  title?: string | null
  description?: string | null
  price?: number | null
  currency?: string | null
  image_urls?: string[] | null
  product_url?: string | null
  sustainability_score?: number | null
  score_explanation?: string | null
  metadata?: unknown
  last_updated?: string
}

export type ExtractedPrice = {
  price: number | null
  currency: string | null
}

export type ListingBucket = 'top' | 'bottom'

export const LISTING_SCRAPE_VERSION = 4

type RetailerRule = {
  domains: string[]
  allowedPathPatterns: RegExp[]
  blockedPathPatterns?: RegExp[]
  searchHints: string[]
}

type ListingMetadata = {
  scrape_version?: number
}

type ListingImageExtractionInput = {
  retailer?: string | null
  product_url?: string | null
  image_urls?: string[] | null
  title?: string | null
  description?: string | null
  raw_content?: string | null
}

const DOCUMENT_EXTENSION_PATTERN = /\.(?:pdf|doc|docx|ppt|pptx|xls|xlsx)(?:$|[?#])/i
const GOOGLE_HOST_PATTERN = /(^|\.)google\./i
const IMAGE_EXTENSION_BLOCK_PATTERN = /\.(?:svg|gif|ico)(?:$|[?#])/i
const IMAGE_ASSET_PATTERN = /(logo|icon|favicon|avatar|placeholder|sprite|pixel|badge|shield|default-user|transparent|meta-preview-image)/i
const PRICE_MATCH_PATTERN = /(?:^|[^\w])(?:(USD|US|GBP|EUR|CAD|AUD)\s*)?(\$|£|€)\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)|\b(USD|GBP|EUR|CAD|AUD)\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/gi
const PRICE_POSITIVE_CONTEXT_PATTERN = /\b(price|now|sale|selling for|buy it now|asking|listed for|offer|current bid|current price)\b/i
const PRICE_NEGATIVE_CONTEXT_PATTERN = /\b(shipping|delivery|tax|fee|fees|buyer protection|protection|deposit)\b/i
const PRICE_OLD_CONTEXT_PATTERN = /\b(was|original|retail|compare at|msrp|valued at)\b/i
const PRICE_DISCOUNT_CONTEXT_PATTERN = /\b(discount|off|sale)\b/i
const TRACKING_QUERY_PARAMS = new Set([
  'amdata',
  'campid',
  'customid',
  'fbclid',
  'gclid',
  'mkcid',
  'mkevt',
  'mkrid',
  'pla_feed',
  'referrer',
  'srsltid',
  'toolid',
  '_trkparms',
  '_trksid',
])
const STATIC_ASSET_HOST_PATTERNS = [
  /^assets\.depop\.com$/i,
  /^contentful\.depop\.com$/i,
  /^ir\.ebaystatic\.com$/i,
  /^marketplace-web-assets\.vinted\.com$/i,
]
const STRICT_IMAGE_HOST_RETAILERS = new Set(['depop', 'ebay', 'vinted', 'whatnot'])
const RETAILER_STOP_MARKERS: Record<string, string[]> = {
  depop: ['More from this seller', 'You might also like', 'Depop Sell Help Site Information'],
  vinted: ['Shipping', 'Buyer Protection fee', "Member's items", 'Similar items'],
  whatnot: ['More from the Seller', 'Buyer Protections', 'About the Seller'],
}
const WHATNOT_IMAGE_PATH_PATTERN = /(?:^|[^a-z0-9])(listings(?:%2f|\/)[^)\s"'\\]+?(?:\.(?:jpe?g|png|webp))?)(?=[)\s"'\\]|$)/gi
const MOCK_LISTING_PATTERN = /\bmock[-_]\d+\b/i
const FASHION_POSITIVE_PATTERNS = [
  /\bjeans?\b/i,
  /\bdenim\b/i,
  /\bshirt\b/i,
  /\bt-?shirt\b/i,
  /\btee\b/i,
  /\btop\b/i,
  /\bblouse\b/i,
  /\bjacket\b/i,
  /\bcoat\b/i,
  /\bhoodie\b/i,
  /\bsweatshirt\b/i,
  /\bsweater\b/i,
  /\bcardigan\b/i,
  /\bpants?\b/i,
  /\btrousers?\b/i,
  /\bshorts?\b/i,
  /\bskirt\b/i,
  /\bdress\b/i,
  /\bjumpsuit\b/i,
  /\boveralls?\b/i,
  /\bvest\b/i,
  /\bwindbreaker\b/i,
  /\bcapri\b/i,
  /\bleggings?\b/i,
  /\bshoe(s)?\b/i,
  /\bsneaker(s)?\b/i,
  /\bboot(s)?\b/i,
  /\bloafer(s)?\b/i,
  /\bheel(s)?\b/i,
  /\bsandal(s)?\b/i,
  /\bbag\b/i,
  /\bhandbag\b/i,
  /\bpurse\b/i,
  /\bbelt\b/i,
]
const FASHION_NEGATIVE_PATTERNS = [
  /\bpattern(s)?\b/i,
  /\bcatalog\b/i,
  /\bpaper\b/i,
  /\bjournal\b/i,
  /\barticle\b/i,
  /\bmagazine\b/i,
  /\bbook\b/i,
  /\bcomic\b/i,
  /\bdvd\b/i,
  /\bcd\b/i,
  /\bvinyl\b/i,
  /\bposter\b/i,
  /\bfan\b/i,
  /\bstool\b/i,
  /\bcandy dish\b/i,
  /\bbuilding\b/i,
  /\bvillage\b/i,
  /\btablet(s)?\b/i,
  /\bnose drops?\b/i,
  /\bmedical\b/i,
  /\bbrand identity\b/i,
  /\bbranding\b/i,
  /\bkit\b/i,
]
const TOP_CLASSIFICATION_PATTERNS = [
  /\bbaby tee\b/i,
  /\bcami(?:sole)?\b/i,
  /\btank(?:\s+top)?\b/i,
  /\bcrop\s+top\b/i,
  /\btop\b/i,
  /\btee\b/i,
  /\bt-?shirt\b/i,
  /\bshirt\b/i,
  /\bblouse\b/i,
  /\bhoodie\b/i,
  /\bsweatshirt\b/i,
  /\bsweater\b/i,
  /\bcardigan\b/i,
  /\bjacket\b/i,
  /\bcoat\b/i,
  /\bcorset\b/i,
  /\bhalter\b/i,
]
const BOTTOM_CLASSIFICATION_PATTERNS = [
  /\bmini skirt\b/i,
  /\bmicro shorts?\b/i,
  /\bcargo pants?\b/i,
  /\bcapri pants?\b/i,
  /\bcapris?\b/i,
  /\bskirt\b/i,
  /\bshorts?\b/i,
  /\bpants?\b/i,
  /\btrousers?\b/i,
  /\bjeans?\b/i,
  /\bjorts?\b/i,
  /\bleggings?\b/i,
]
const GLOBAL_BLOCKED_PATH_PATTERNS = [
  /\/blog(?:\/|$)/i,
  /\/catalog(?:\/|$)/i,
  /\/collections?(?:\/|$)/i,
  /\/editorial(?:\/|$)/i,
  /\/journal(?:\/|$)/i,
  /\/news(?:\/|$)/i,
  /\/newsroom(?:\/|$)/i,
  /\/press(?:\/|$)/i,
  /\/report(?:s)?(?:\/|$)/i,
  /\/documents?(?:\/|$)/i,
  /\/sustainability(?:\/|$)/i,
  /\/brands?(?:\/|$)/i,
  /\/shops?(?:\/|$)/i,
  /\/categories?(?:\/|$)/i,
  /\/search(?:\/|$)/i,
  /\/theme(?:\/|$)/i,
]
const SEARCH_NEGATIONS = [
  '-pdf',
  '-blog',
  '-catalog',
  '-collection',
  '-news',
  '-newsroom',
  '-journal',
  '-report',
  '-press',
  '-brand',
  '-brands',
  '-shop',
  '-shops',
  '-category',
  '-categories',
  '-theme',
  '-search',
].join(' ')
const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])
const RETAILER_IMAGE_HOST_PATTERNS: Record<string, RegExp[]> = {
  depop: [/^media-photos\.depop\.com$/i],
  vinted: [/\.vinted\.net$/i],
  ebay: [/^i\.ebayimg\.com$/i],
  thredup: [/thredup\./i],
  vestiaire: [/vestiaire/i],
  whatnot: [/^images\.whatnot\.com$/i],
}

const RETAILER_RULES: Record<string, RetailerRule> = {
  depop: {
    domains: ['depop.com'],
    allowedPathPatterns: [/^\/products\//i],
    blockedPathPatterns: [/^\/search\//i, /^\/theme\//i],
    searchHints: ['"/products/"', '"secondhand fashion listing"'],
  },
  vinted: {
    domains: ['vinted.com'],
    allowedPathPatterns: [/^\/items\//i],
    blockedPathPatterns: [/^\/brand\//i, /^\/catalog\//i, /^\/member\//i],
    searchHints: ['"/items/"', '"preowned clothing listing"'],
  },
  ebay: {
    domains: ['ebay.com'],
    allowedPathPatterns: [/^\/itm\//i],
    blockedPathPatterns: [/^\/b\//i, /^\/sch\//i, /^\/shop\//i, /^\/str\//i],
    searchHints: ['"/itm/"', '"used clothing listing"', '"Buy It Now"'],
  },
  thredup: {
    domains: ['thredup.com'],
    allowedPathPatterns: [],
    blockedPathPatterns: [/^\/bg\/p\//i],
    searchHints: ['"secondhand clothing item"'],
  },
  vestiaire: {
    domains: ['vestiairecollective.com'],
    allowedPathPatterns: [],
    searchHints: ['"designer resale item"'],
  },
  whatnot: {
    domains: ['whatnot.com'],
    allowedPathPatterns: [/^\/listing\//i],
    blockedPathPatterns: [/^\/category\//i, /^\/clip\//i, /^\/seller\//i],
    searchHints: ['"/listing/"', '"preowned apparel listing"'],
  },
}

export function buildRetailerSearchQuery(query: string, retailer: string, domain: string): string {
  return buildRetailerSearchQueries(query, retailer, domain)[0] ?? query.trim()
}

export function buildRetailerSearchQueries(query: string, retailer: string, domain: string): string[] {
  const normalizedRetailer = retailer.trim().toLowerCase()
  const retailerRule = RETAILER_RULES[normalizedRetailer]
  const exactPhrase = buildExactRetailerSearchPhrase(query)
  const normalizedQuery = query.trim().replace(/\s+/g, ' ')
  const variants = [
    [
      exactPhrase ?? normalizedQuery,
      `site:${domain}`,
      ...(retailerRule?.searchHints ?? []),
      SEARCH_NEGATIONS,
    ],
    [
      normalizedRetailer,
      normalizedQuery,
      SEARCH_NEGATIONS,
    ],
    [
      normalizedQuery,
      normalizedRetailer,
      SEARCH_NEGATIONS,
    ],
  ]
    .map((parts) => parts.filter(Boolean).join(' ').trim())
    .filter(Boolean)

  return Array.from(new Set(variants))
}

function buildExactRetailerSearchPhrase(query: string): string | null {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ')
  if (!normalizedQuery) {
    return null
  }

  const tokenCount = normalizedQuery.split(' ').length
  if (tokenCount < 2 || tokenCount > 6 || normalizedQuery.length > 64) {
    return null
  }

  return `"${normalizedQuery}"`
}

export function normalizeListingPrice(price: number | null | undefined): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null
  }

  return Number(price.toFixed(2))
}

export function extractListingPrice(...textSources: Array<string | null | undefined>): ExtractedPrice {
  const haystack = textSources
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')

  if (!haystack) {
    return { price: null, currency: null }
  }

  const candidates: Array<ExtractedPrice & { index: number; score: number }> = []
  PRICE_MATCH_PATTERN.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = PRICE_MATCH_PATTERN.exec(haystack)) !== null) {
    const amountText = match[3] ?? match[5]
    const normalizedPrice = normalizeListingPrice(parsePriceNumber(amountText))

    if (normalizedPrice == null) {
      continue
    }

    const contextStart = Math.max(0, match.index - 48)
    const contextEnd = Math.min(haystack.length, match.index + match[0].length + 48)
    const context = haystack.slice(contextStart, contextEnd).toLowerCase()
    let score = 100 - Math.min(match.index, 480) / 24

    if (PRICE_POSITIVE_CONTEXT_PATTERN.test(context)) {
      score += 45
    }

    if (PRICE_DISCOUNT_CONTEXT_PATTERN.test(context)) {
      score += 25
    }

    if (PRICE_NEGATIVE_CONTEXT_PATTERN.test(context)) {
      score -= 65
    }

    if (PRICE_OLD_CONTEXT_PATTERN.test(context)) {
      score -= 35
    }

    if (normalizedPrice >= 3 && normalizedPrice <= 5000) {
      score += 10
    }

    candidates.push({
      price: normalizedPrice,
      currency: normalizeCurrencyCode(match[1] ?? match[4], match[2]),
      index: match.index,
      score,
    })
  }

  adjustDiscountCandidateScores(candidates, haystack)

  candidates.sort((left, right) =>
    right.score - left.score ||
    left.price! - right.price! ||
    left.index - right.index
  )

  const best = candidates[0]
  if (!best || best.score < 20) {
    return { price: null, currency: null }
  }

  return {
    price: best.price,
    currency: best.currency ?? 'USD',
  }
}

export function extractRetailerListingPrice(
  retailer: string | null | undefined,
  title: string | null | undefined,
  ...textSources: Array<string | null | undefined>
): ExtractedPrice {
  const normalizedRetailer = retailer?.trim().toLowerCase() ?? ''
  const normalizedTitle = normalizeText(title)
  const focusedTextSources = textSources.map((value) =>
    focusRetailerExtractionText(normalizedRetailer, normalizedTitle, value),
  )

  return extractListingPrice(
    normalizedTitle,
    ...(
      normalizedRetailer === 'vinted'
        ? focusedTextSources.map((value) => stripVintedInclusivePrices(value))
        : focusedTextSources
    ),
  )
}

export function extractListingImageUrls(input: ListingImageExtractionInput): string[] {
  const retailer = input.retailer?.trim().toLowerCase() ?? null
  const providedImages = Array.isArray(input.image_urls) ? input.image_urls : []

  if (retailer === 'vinted') {
    const extractedFromProvided = extractVintedListingImages(providedImages)
    if (extractedFromProvided.length > 0) {
      return normalizeListingImageUrls(
        extractedFromProvided,
        retailer ?? undefined,
        input.product_url ?? undefined,
      )
    }
  }

  if (retailer === 'whatnot') {
    const extractedFromText = extractWhatnotListingImages(
      focusRetailerImageText(retailer, normalizeText(input.title), input.raw_content) ??
        focusRetailerImageText(retailer, normalizeText(input.title), input.description),
    )

    if (extractedFromText.length > 0) {
      return normalizeListingImageUrls(
        extractedFromText,
        retailer ?? undefined,
        input.product_url ?? undefined,
      )
    }
  }

  return normalizeListingImageUrls(providedImages, retailer ?? undefined, input.product_url ?? undefined)
}

export function needsListingRefresh(candidate: ListingCandidate): boolean {
  const retailer = (candidate.retailer ?? '').trim().toLowerCase()
  if (retailer !== 'depop' && retailer !== 'whatnot' && retailer !== 'vinted') {
    return false
  }

  const metadata = getListingMetadata(candidate.metadata)
  return (metadata.scrape_version ?? 0) < LISTING_SCRAPE_VERSION
}

export function normalizeListingCandidate<T extends ListingCandidate>(
  candidate: T,
  retailerHint?: string,
): T | null {
  const retailer = (retailerHint ?? candidate.retailer ?? '').trim().toLowerCase()
  const retailerRule = RETAILER_RULES[retailer]
  const title = normalizeText(candidate.title)
  const rawUrl = normalizeText(candidate.product_url)

  if (!retailerRule || !title || title.toLowerCase() === 'untitled' || !rawUrl) {
    return null
  }

  let productUrl: URL
  try {
    productUrl = new URL(rawUrl)
  } catch {
    return null
  }

  const hostname = productUrl.hostname.toLowerCase()
  const pathname = productUrl.pathname.toLowerCase()

  if (
    MOCK_LISTING_PATTERN.test(candidate.id ?? '') ||
    MOCK_LISTING_PATTERN.test(rawUrl) ||
    (productUrl.protocol !== 'http:' && productUrl.protocol !== 'https:') ||
    GOOGLE_HOST_PATTERN.test(hostname) ||
    DOCUMENT_EXTENSION_PATTERN.test(productUrl.pathname) ||
    title.toLowerCase().includes('[pdf]') ||
    !retailerRule.domains.some((domain) => hostnameMatches(hostname, domain)) ||
    GLOBAL_BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    (retailerRule.blockedPathPatterns ?? []).some((pattern) => pattern.test(pathname)) ||
    retailerRule.allowedPathPatterns.length === 0 ||
    !retailerRule.allowedPathPatterns.some((pattern) => pattern.test(pathname))
  ) {
    return null
  }

  if (!isLikelyFashionListing(title, candidate.description)) {
    return null
  }

  const fallbackPrice = extractListingPrice(title, candidate.description)
  const normalizedPrice = normalizeListingPrice(candidate.price) ?? fallbackPrice.price

  return {
    ...candidate,
    retailer,
    title,
    description: normalizeText(candidate.description),
    price: normalizedPrice,
    currency: normalizedPrice == null
      ? null
      : normalizeCurrency(candidate.currency) ?? fallbackPrice.currency ?? 'USD',
    image_urls: normalizeListingImageUrls(candidate.image_urls, retailer, productUrl),
    product_url: normalizeProductUrl(productUrl),
  }
}

export function filterValidatedListings<T extends ListingCandidate>(
  products: T[],
  search: string,
  retailer: string | null,
): T[] {
  const normalizedRetailer = retailer && retailer !== 'all' ? retailer.toLowerCase() : null
  const searchTerms = normalizeSearchTerms(search)
  const deduped = new Map<string, T>()

  for (const product of products) {
    const normalized = normalizeListingCandidate(product)
    if (!normalized) {
      continue
    }

    if (normalizedRetailer && normalized.retailer !== normalizedRetailer) {
      continue
    }

    if (!matchesSearchQuery(normalized, searchTerms)) {
      continue
    }

    const key = normalized.product_url ?? normalized.id ?? `${normalized.retailer}:${normalized.title}`
    if (!deduped.has(key)) {
      deduped.set(key, normalized)
    }
  }

  return Array.from(deduped.values())
}

export function matchesListingSearch(candidate: ListingCandidate, search: string): boolean {
  return matchesSearchQuery(candidate, normalizeSearchTerms(search))
}

export function classifyListingBucket(candidate: Pick<ListingCandidate, 'title' | 'description'>): ListingBucket | null {
  const haystack = `${candidate.title ?? ''} ${candidate.description ?? ''}`.trim()
  if (!haystack) {
    return null
  }

  const topMatch = TOP_CLASSIFICATION_PATTERNS.some((pattern) => pattern.test(haystack))
  const bottomMatch = BOTTOM_CLASSIFICATION_PATTERNS.some((pattern) => pattern.test(haystack))

  if (topMatch && !bottomMatch) {
    return 'top'
  }

  if (bottomMatch && !topMatch) {
    return 'bottom'
  }

  return null
}

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

export function normalizeListingImageUrls(
  imageUrls: string[] | null | undefined,
  retailerHint?: string,
  productUrlHint?: string | URL | null,
): string[] {
  if (!Array.isArray(imageUrls)) {
    return []
  }

  const retailer = retailerHint?.trim().toLowerCase() ?? null
  const preferredHosts = retailer ? RETAILER_IMAGE_HOST_PATTERNS[retailer] ?? [] : []
  const strictHosts = retailer ? STRICT_IMAGE_HOST_RETAILERS.has(retailer) : false
  const deduped = new Map<string, { score: number; url: string }>()

  for (const imageUrl of imageUrls) {
    if (typeof imageUrl !== 'string') {
      continue
    }

    let parsed: URL
    try {
      parsed = new URL(imageUrl)
    } catch {
      continue
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue
    }

    const hostname = parsed.hostname.toLowerCase()
    const pathname = parsed.pathname.toLowerCase()

    if (
      (strictHosts && !preferredHosts.some((pattern) => pattern.test(hostname))) ||
      IMAGE_EXTENSION_BLOCK_PATTERN.test(pathname) ||
      IMAGE_ASSET_PATTERN.test(hostname) ||
      IMAGE_ASSET_PATTERN.test(pathname) ||
      !isRetailerImagePathAllowed(retailer, pathname) ||
      pathname.includes('/_next/static/media/') ||
      STATIC_ASSET_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
    ) {
      continue
    }

    const normalizedUrl = normalizeImageUrl(parsed, retailer)
    const score = scoreImageUrl(parsed, preferredHosts, retailer, productUrlHint)
    if (score < 0) {
      continue
    }

    const existing = deduped.get(normalizedUrl)
    if (!existing || score > existing.score) {
      deduped.set(normalizedUrl, { score, url: normalizedUrl })
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.score - left.score || right.url.length - left.url.length)
    .slice(0, 6)
    .map((entry) => entry.url)
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const normalized = normalizeText(value)?.toUpperCase() ?? null
  if (!normalized) {
    return null
  }

  if (normalized === 'US') {
    return 'USD'
  }

  return /^[A-Z]{3}$/.test(normalized) ? normalized : null
}

function normalizeCurrencyCode(value: string | undefined, symbol: string | undefined): string | null {
  const normalizedValue = normalizeCurrency(value)
  if (normalizedValue) {
    return normalizedValue
  }

  if (symbol === '$') {
    return 'USD'
  }

  if (symbol === '£') {
    return 'GBP'
  }

  if (symbol === '€') {
    return 'EUR'
  }

  return null
}

function normalizeProductUrl(productUrl: URL): string {
  const normalized = new URL(productUrl.toString())
  normalized.hash = ''

  for (const key of Array.from(normalized.searchParams.keys())) {
    const lowerKey = key.toLowerCase()
    if (TRACKING_QUERY_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
      normalized.searchParams.delete(key)
    }
  }

  return normalized.toString()
}

function normalizeImageUrl(imageUrl: URL, retailer: string | null): string {
  const normalized = new URL(imageUrl.toString())
  normalized.hash = ''

  if (retailer === 'depop') {
    normalized.pathname = normalized.pathname.replace(/\/P\d+(\.[a-z0-9]+)$/i, '/P0$1')
  }

  if (retailer === 'ebay' && normalized.hostname.toLowerCase() === 'i.ebayimg.com') {
    normalized.pathname = normalized.pathname.replace(
      /\/s-l(?:140|160|225|300|400|500|640|960|1200)(\.[a-z0-9]+)$/i,
      '/s-l1600$1',
    )
  }

  if (retailer === 'vinted') {
    normalized.pathname = normalized.pathname.replace(/\/(?:\d+x\d+|f\d+)\//i, '/f800/')
  }

  if (retailer === 'whatnot') {
    normalized.pathname = normalized.pathname.replace(/\/fit-in\/\d+x0\//i, '/fit-in/3840x0/')
  }

  return normalized.toString()
}

function scoreImageUrl(
  imageUrl: URL,
  preferredHosts: RegExp[],
  retailer: string | null,
  productUrlHint?: string | URL | null,
): number {
  const hostname = imageUrl.hostname.toLowerCase()
  const pathname = imageUrl.pathname.toLowerCase()
  let score = 0

  if (preferredHosts.some((pattern) => pattern.test(hostname))) {
    score += 50
  }

  if (/\.(?:jpe?g|png|webp)$/i.test(pathname)) {
    score += 10
  }

  if (/\/f800\//i.test(pathname) || /s-l1600/i.test(pathname)) {
    score += 30
  } else if (/\/fit-in\/3840x0\//i.test(pathname)) {
    score += 30
  } else if (/\/\d{3,4}x\d{3,4}\//i.test(pathname) || /s-l(?:400|500|640|960|1200)/i.test(pathname)) {
    score += 18
  } else if (/s-l140/i.test(pathname)) {
    score += 4
  }

  if (pathname.includes('stockimage')) {
    score -= 80
  }

  if (retailer === 'depop') {
    if (/\/P0\.[a-z0-9]+$/i.test(pathname)) {
      score += 40
    }

    if (/\/u\d+\.[a-z0-9]+$/i.test(pathname)) {
      score -= 90
    }
  }

  if (retailer === 'whatnot') {
    if (pathname.includes('/users%2f') || pathname.includes('/users/') || pathname.includes('/store%2f') || pathname.includes('/store/')) {
      score -= 100
    }

    const listingId = extractWhatnotListingId(productUrlHint)
    if (listingId && pathname.includes(`${listingId}-`)) {
      score += 45
    } else if (pathname.includes('/listings%2f0-') || pathname.includes('/listings/0-')) {
      score += 20
    }

    if (pathname.includes('/pending/')) {
      score -= 15
    }
  }

  return score
}

function parsePriceNumber(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function focusRetailerExtractionText(
  retailer: string,
  title: string | null,
  text: string | null | undefined,
): string | null {
  const normalizedText = normalizeText(text)
  if (!normalizedText) {
    return null
  }

  let focused = normalizedText
  const lowerText = normalizedText.toLowerCase()
  const normalizedTitle = title ?? ''
  const lowerTitle = normalizedTitle.toLowerCase() || null
  const titleIndex = lowerTitle ? lowerText.indexOf(lowerTitle) : -1

  if (titleIndex >= 0) {
    const start = Math.max(0, titleIndex - 160)
    const end = Math.min(
      normalizedText.length,
      titleIndex + Math.max(normalizedTitle.length + 1400, 900),
    )
    focused = normalizedText.slice(start, end)
  } else if (retailer === 'whatnot') {
    focused = normalizedText.slice(0, Math.min(normalizedText.length, 1400))
  } else if (retailer === 'depop') {
    const buyNowIndex = lowerText.indexOf('buy now')
    if (buyNowIndex >= 0) {
      focused = normalizedText.slice(Math.max(0, buyNowIndex - 260))
    }
  }

  return trimAtStopMarker(focused, RETAILER_STOP_MARKERS[retailer] ?? [])
}

function focusRetailerImageText(
  retailer: string,
  title: string | null,
  text: string | null | undefined,
): string | null {
  const normalizedText = normalizeText(text)
  if (!normalizedText) {
    return null
  }

  if (retailer !== 'whatnot') {
    return trimAtStopMarker(normalizedText, RETAILER_STOP_MARKERS[retailer] ?? [])
  }

  const lowerText = normalizedText.toLowerCase()
  const normalizedTitle = title ?? ''
  const lowerTitle = normalizedTitle.toLowerCase()
  let focused = normalizedText

  if (lowerTitle) {
    const titleIndex = lowerText.indexOf(lowerTitle)
    if (titleIndex >= 0) {
      focused = normalizedText.slice(Math.max(0, titleIndex - 120))
    }
  }

  const detailsIndex = focused.toLowerCase().indexOf('product details')
  if (detailsIndex >= 0) {
    focused = focused.slice(0, detailsIndex)
  }

  return trimAtStopMarker(focused, RETAILER_STOP_MARKERS[retailer] ?? [])
}

function trimAtStopMarker(text: string, stopMarkers: string[]): string {
  let end = text.length
  const lowerText = text.toLowerCase()

  for (const marker of stopMarkers) {
    const index = lowerText.indexOf(marker.toLowerCase())
    if (index >= 0) {
      end = Math.min(end, index)
    }
  }

  return text.slice(0, end)
}

function adjustDiscountCandidateScores(
  candidates: Array<ExtractedPrice & { index: number; score: number }>,
  haystack: string,
): void {
  for (let index = 0; index < candidates.length; index += 1) {
    const current = candidates[index]

    for (let nextIndex = index + 1; nextIndex < candidates.length; nextIndex += 1) {
      const next = candidates[nextIndex]
      if (next.index - current.index > 80) {
        break
      }

      const nearbyWindow = haystack.slice(current.index, Math.min(haystack.length, next.index + 48)).toLowerCase()
      if (PRICE_DISCOUNT_CONTEXT_PATTERN.test(nearbyWindow) && next.price !== null && current.price !== null && next.price < current.price) {
        current.score -= 45
        next.score += 35
      }
    }
  }
}

function stripVintedInclusivePrices(text: string | null): string | null {
  if (!text) {
    return null
  }

  return text.replace(
    /(?:^|[^\w])(?:(?:USD|US|GBP|EUR|CAD|AUD)\s*)?(?:\$|£|€)\s?\d{1,4}(?:,\d{3})*(?:\.\d{2})?\s*(?:incl\.?|includes\s+buyer\s+protection)\b/gi,
    ' ',
  )
}

function extractVintedListingImages(imageUrls: string[]): string[] {
  const validImages = imageUrls
    .map((imageUrl, index) => {
      if (typeof imageUrl !== 'string') {
        return null
      }

      try {
        const parsed = new URL(imageUrl)
        const hostname = parsed.hostname.toLowerCase()
        const pathname = parsed.pathname.toLowerCase()

        if (
          !/\.vinted\.net$/i.test(hostname) ||
          IMAGE_EXTENSION_BLOCK_PATTERN.test(pathname) ||
          IMAGE_ASSET_PATTERN.test(hostname) ||
          IMAGE_ASSET_PATTERN.test(pathname)
        ) {
          return null
        }

        return {
          index,
          url: imageUrl,
          groupKey: extractVintedImageGroupKey(parsed) ?? `idx:${index}`,
        }
      } catch {
        return null
      }
    })
    .filter((candidate): candidate is { index: number; url: string; groupKey: string } => candidate !== null)

  if (validImages.length === 0) {
    return []
  }

  const grouped = new Map<string, { firstIndex: number; urls: string[] }>()

  for (const image of validImages) {
    const existing = grouped.get(image.groupKey)
    if (existing) {
      existing.urls.push(image.url)
      existing.firstIndex = Math.min(existing.firstIndex, image.index)
    } else {
      grouped.set(image.groupKey, { firstIndex: image.index, urls: [image.url] })
    }
  }

  const sortedGroups = Array.from(grouped.values())
    .sort((left, right) => right.urls.length - left.urls.length || left.firstIndex - right.firstIndex)

  const preferredGroup = sortedGroups[0]
  return preferredGroup ? preferredGroup.urls : []
}

function extractWhatnotListingImages(text: string | null): string[] {
  if (!text) {
    return []
  }

  const matches = new Set<string>()
  WHATNOT_IMAGE_PATH_PATTERN.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = WHATNOT_IMAGE_PATH_PATTERN.exec(text)) !== null) {
    const rawPath = match[1]
      .replace(/[).,]+$/, '')
      .replace(/^\/+/, '')

    if (!rawPath) {
      continue
    }

    const lowerPath = rawPath.toLowerCase()
    if (
      lowerPath.includes('users%2f') ||
      lowerPath.includes('users/') ||
      lowerPath.includes('store%2f') ||
      lowerPath.includes('store/')
    ) {
      continue
    }

    matches.add(`https://images.whatnot.com/fit-in/3840x0/filters:format(webp)/${rawPath}`)
  }

  return Array.from(matches)
}

function isRetailerImagePathAllowed(retailer: string | null, pathname: string): boolean {
  if (retailer === 'depop') {
    return /\/P\d+\.[a-z0-9]+$/i.test(pathname)
  }

  if (retailer === 'vinted') {
    return /\/(?:\d+x\d+|f\d+)\/\d+\.(?:webp|jpe?g|png)$/i.test(pathname)
  }

  if (retailer === 'whatnot') {
    return pathname.includes('/listings%2f') || pathname.includes('/listings/')
  }

  return true
}

function extractWhatnotListingId(productUrlHint?: string | URL | null): string | null {
  if (!productUrlHint) {
    return null
  }

  let pathname = ''

  if (productUrlHint instanceof URL) {
    pathname = productUrlHint.pathname
  } else {
    try {
      pathname = new URL(productUrlHint).pathname
    } catch {
      return null
    }
  }

  const match = pathname.match(/\/listing\/([^/?#]+)/i)
  if (!match?.[1]) {
    return null
  }

  try {
    const decoded = globalThis.atob(match[1])
    const listingMatch = decoded.match(/ListingNode:(\d+)/i)
    return listingMatch?.[1] ?? null
  } catch {
    return null
  }
}

function extractVintedImageGroupKey(imageUrl: URL): string | null {
  const match = imageUrl.pathname.match(/\/(?:\d+x\d+|f\d+)\/(\d+)\.(?:webp|jpe?g|png)$/i)
  return match?.[1] ?? null
}

function getListingMetadata(value: unknown): ListingMetadata {
  return typeof value === 'object' && value !== null ? value as ListingMetadata : {}
}

function isLikelyFashionListing(
  title: string,
  description: string | null | undefined,
): boolean {
  const haystack = `${title} ${description ?? ''}`

  if (FASHION_NEGATIVE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return false
  }

  return FASHION_POSITIVE_PATTERNS.some((pattern) => pattern.test(haystack))
}

function normalizeSearchTerms(search: string): string[] {
  const trimmed = search.trim().toLowerCase()
  if (!trimmed) {
    return []
  }

  const quotedTerms = Array.from(trimmed.matchAll(/"([^"]+)"/g))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value))

  const bareTokens = Array.from(trimmed.replace(/"[^"]+"/g, ' ').match(/[a-z0-9]+/g) ?? [])
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token))

  return Array.from(new Set([...quotedTerms, ...bareTokens]))
}

function matchesSearchQuery(candidate: ListingCandidate, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) {
    return true
  }

  const haystack = `${candidate.title ?? ''} ${candidate.description ?? ''} ${candidate.retailer ?? ''}`
    .toLowerCase()
  const matchedTerms = searchTerms.filter((term) => haystack.includes(term))

  if (matchedTerms.length === searchTerms.length) {
    return true
  }

  if (searchTerms.length === 1) {
    return matchedTerms.length === 1
  }

  const minimumMatches = searchTerms.length <= 2
    ? searchTerms.length
    : Math.min(searchTerms.length, Math.max(2, Math.ceil(searchTerms.length * 0.6)))

  return matchedTerms.length >= minimumMatches
}
