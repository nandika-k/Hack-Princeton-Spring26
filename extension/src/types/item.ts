export type ScrapedItem = {
  url: string
  retailer: string
  title: string
  brand?: string
  price?: number
  currency?: string
  image_url?: string
  description?: string
  material?: string
  origin?: string
  scraped_at: number
}

export type FiberProfile = {
  material: string
  quality: 'long-lasting' | 'medium' | 'low-quality' | 'unknown'
  notes: string
}

export type CarbonFootprint = {
  kg_co2e: number | null
  comparison: string
  confidence: 'high' | 'medium' | 'low'
}

export type SustainabilityBreakdown = {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  origin: string
  fiber: FiberProfile
  carbon: CarbonFootprint
  fast_fashion_risk: 'low' | 'medium' | 'high'
  environmental_notes: string
  price_display: string
  explanation: string
  source: 'live' | 'fallback'
  generated_at: number
}

export type ExtensionStatus = {
  enabled: boolean
  last_toggled_at: number
}

export type CacheEntry = {
  item: ScrapedItem
  breakdown: SustainabilityBreakdown
  cached_at: number
}
