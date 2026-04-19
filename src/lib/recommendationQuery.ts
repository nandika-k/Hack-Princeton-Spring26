export type RecommendationPreferences = {
  style_tags?: string[] | null
  occasions?: string[] | null
  style_text?: string | null
} | null

export type SearchBucket = 'top' | 'bottom' | 'general'

export type RetailerSearchQuery = {
  query: string
  bucket: SearchBucket
  fallback?: boolean
}

export type RetailerSearchPlan = {
  retailer: string
  baseQuery: string
  diversified: boolean
  cacheQueries: string[]
  liveQueries: RetailerSearchQuery[]
}

export const DEFAULT_RECOMMENDATION_QUERY = 'sustainable secondhand vintage clothing'

const STYLE_QUERY_ALIASES: Record<string, string> = {
  y2k: 'y2k',
  'vintage 90s': '90s vintage',
  streetwear: 'streetwear',
  boho: 'boho',
  'dark academia': 'dark academia',
  cottagecore: 'cottagecore',
  minimalist: 'minimalist',
}

const OCCASION_QUERY_ALIASES: Record<string, string> = {
  prom: 'prom outfit',
  wedding: 'wedding guest outfit',
  work: 'workwear',
  'date night': 'date night outfit',
}

const DIVERSIFIED_RETAILERS = new Set(['depop', 'vinted'])
const STYLE_SIGNAL_PATTERN = /\b(?:y2k|streetwear|boho|dark academia|cottagecore|minimalist|vintage|90s|prom|wedding|workwear|date night)\b/i
const EXPLICIT_GARMENT_PATTERN = /\b(?:tee|t-?shirt|shirt|top|tops|blouse|cami|camisole|tank|hoodie|sweater|cardigan|jacket|coat|corset|dress|skirt|skirts|shorts|pants|trousers|cargo|capri|jeans|jorts|leggings|sneakers?|boots?|heels?|sandals?|loafers?|bag|bags|purse|belt)\b/i
const TOP_SEARCH_TERMS = ['baby tee', 'cami', 'tank top', 'crop top'] as const
const BOTTOM_SEARCH_TERMS = ['mini skirt', 'micro shorts', 'cargo pants', 'capri pants'] as const
const BOTTOM_FALLBACK_TERMS = ['low rise jeans'] as const

export function buildRecommendationQuery(
  prefs: RecommendationPreferences,
  search: string = '',
): string {
  const searchPhrase = normalizeQueryText(search)
  const stylePhrase = buildStylePhrase(prefs?.style_tags ?? [])
  const occasionPhrase = buildOccasionPhrase(prefs?.occasions ?? [])

  if (searchPhrase) {
    return mergeQueryParts(searchPhrase, stylePhrase, occasionPhrase) ?? DEFAULT_RECOMMENDATION_QUERY
  }

  return mergeQueryParts(stylePhrase, occasionPhrase) ?? DEFAULT_RECOMMENDATION_QUERY
}

export function getQuotedRecommendationPhrase(query: string): string | null {
  const normalized = normalizeQueryText(query)
  if (!normalized) {
    return null
  }

  const tokens = normalized.split(' ')
  if (tokens.length < 2 || tokens.length > 6 || normalized.length > 64) {
    return null
  }

  return `"${normalized}"`
}

export function buildRetailerSearchPlan(query: string, retailer: string): RetailerSearchPlan {
  const normalizedRetailer = normalizeQueryText(retailer) ?? retailer.trim().toLowerCase()
  const baseQuery = normalizeQueryText(query) ?? DEFAULT_RECOMMENDATION_QUERY

  if (
    !DIVERSIFIED_RETAILERS.has(normalizedRetailer) ||
    hasExplicitGarmentIntent(baseQuery) ||
    !hasStyleSignal(baseQuery)
  ) {
    return {
      retailer: normalizedRetailer,
      baseQuery,
      diversified: false,
      cacheQueries: [baseQuery],
      liveQueries: [{ query: baseQuery, bucket: 'general' }],
    }
  }

  const topQueries = buildBucketQueries(baseQuery, TOP_SEARCH_TERMS)
  const bottomQueries = buildBucketQueries(baseQuery, BOTTOM_SEARCH_TERMS)
  const fallbackBottomQueries = buildBucketQueries(baseQuery, BOTTOM_FALLBACK_TERMS)

  return {
    retailer: normalizedRetailer,
    baseQuery,
    diversified: true,
    cacheQueries: [...topQueries, ...bottomQueries],
    liveQueries: [
      ...topQueries.map((bucketQuery) => ({ query: bucketQuery, bucket: 'top' as const })),
      ...bottomQueries.map((bucketQuery) => ({ query: bucketQuery, bucket: 'bottom' as const })),
      ...fallbackBottomQueries.map((bucketQuery) => ({
        query: bucketQuery,
        bucket: 'bottom' as const,
        fallback: true,
      })),
    ],
  }
}

function buildStylePhrase(styleTags: string[]): string | null {
  const mappedStyles = styleTags
    .map((tag) => STYLE_QUERY_ALIASES[normalizeQueryText(tag) ?? ''] ?? normalizeQueryText(tag))
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)

  return mergeQueryParts(...mappedStyles)
}

function buildOccasionPhrase(occasions: string[]): string | null {
  const mappedOccasion = occasions
    .map((occasion) => OCCASION_QUERY_ALIASES[normalizeQueryText(occasion) ?? ''] ?? normalizeQueryText(occasion))
    .find((value) => value && value !== 'everyday')

  return mappedOccasion ?? null
}

function mergeQueryParts(...parts: Array<string | null | undefined>): string | null {
  const tokens: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    const normalizedPart = normalizeQueryText(part)
    if (!normalizedPart) {
      continue
    }

    for (const token of normalizedPart.split(' ')) {
      const normalizedToken = token.toLowerCase()
      if (seen.has(normalizedToken)) {
        continue
      }

      seen.add(normalizedToken)
      tokens.push(token)
    }
  }

  return tokens.length > 0 ? tokens.join(' ') : null
}

function buildBucketQueries(baseQuery: string, terms: readonly string[]): string[] {
  return terms
    .map((term) => mergeQueryParts(baseQuery, term))
    .filter((value): value is string => Boolean(value))
}

function hasExplicitGarmentIntent(query: string): boolean {
  return EXPLICIT_GARMENT_PATTERN.test(query)
}

function hasStyleSignal(query: string): boolean {
  return STYLE_SIGNAL_PATTERN.test(query)
}

function normalizeQueryText(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string'
    ? value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s'&-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    : ''

  return normalized ? normalized.toLowerCase() : null
}
