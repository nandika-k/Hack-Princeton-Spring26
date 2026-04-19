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

type RetailerRule = {
  domains: string[]
  allowedPathPatterns: RegExp[]
  blockedPathPatterns?: RegExp[]
  searchHints: string[]
}

const DOCUMENT_EXTENSION_PATTERN = /\.(?:pdf|doc|docx|ppt|pptx|xls|xlsx)(?:$|[?#])/i
const GOOGLE_HOST_PATTERN = /(^|\.)google\./i
const GLOBAL_BLOCKED_PATH_PATTERNS = [
  /\/blog(?:\/|$)/i,
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
]
const SEARCH_NEGATIONS = [
  '-pdf',
  '-blog',
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
].join(' ')

const RETAILER_RULES: Record<string, RetailerRule> = {
  depop: {
    domains: ['depop.com'],
    allowedPathPatterns: [/^\/products\//i],
    searchHints: ['"/products/"', '"secondhand fashion listing"'],
  },
  vinted: {
    domains: ['vinted.com'],
    allowedPathPatterns: [/^\/items\//i],
    searchHints: ['"/items/"', '"preowned clothing listing"'],
  },
  ebay: {
    domains: ['ebay.com'],
    allowedPathPatterns: [/^\/itm\//i],
    searchHints: ['"/itm/"', '"used clothing listing"'],
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
    blockedPathPatterns: [/^\/clip\//i],
    searchHints: ['"/listing/"', '"preowned apparel listing"'],
  },
}

export function buildRetailerSearchQuery(query: string, retailer: string, domain: string): string {
  const normalizedRetailer = retailer.trim().toLowerCase()
  const retailerRule = RETAILER_RULES[normalizedRetailer]

  return [
    query.trim(),
    `site:${domain}`,
    ...(retailerRule?.searchHints ?? []),
    SEARCH_NEGATIONS,
  ]
    .filter(Boolean)
    .join(' ')
}

export function normalizeListingPrice(price: number | null | undefined): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null
  }

  return Number(price.toFixed(2))
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

  return {
    ...candidate,
    retailer,
    title,
    description: normalizeText(candidate.description),
    price: normalizeListingPrice(candidate.price),
    currency: candidate.currency ?? 'USD',
    image_urls: normalizeImageUrls(candidate.image_urls),
    product_url: productUrl.toString(),
  }
}

export function filterValidatedListings<T extends ListingCandidate>(
  products: T[],
  search: string,
  retailer: string | null,
): T[] {
  const normalizedRetailer = retailer && retailer !== 'all' ? retailer.toLowerCase() : null
  const normalizedSearch = search.trim().toLowerCase()
  const deduped = new Map<string, T>()

  for (const product of products) {
    const normalized = normalizeListingCandidate(product)
    if (!normalized) {
      continue
    }

    if (normalizedRetailer && normalized.retailer !== normalizedRetailer) {
      continue
    }

    if (normalizedSearch) {
      const haystack = `${normalized.title ?? ''} ${normalized.description ?? ''} ${normalized.retailer ?? ''}`
        .toLowerCase()
      if (!haystack.includes(normalizedSearch)) {
        continue
      }
    }

    const key = normalized.id ?? normalized.product_url ?? `${normalized.retailer}:${normalized.title}`
    if (!deduped.has(key)) {
      deduped.set(key, normalized)
    }
  }

  return Array.from(deduped.values())
}

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function normalizeImageUrls(imageUrls: string[] | null | undefined): string[] {
  if (!Array.isArray(imageUrls)) {
    return []
  }

  return imageUrls.filter((url): url is string => {
    if (typeof url !== 'string') {
      return false
    }

    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  })
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}
