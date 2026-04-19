import type { Tables } from '../integrations/supabase/types'

type ProductRow = Tables<'products'>

export type Product = Omit<
  ProductRow,
  | 'brand'
  | 'description'
  | 'price'
  | 'currency'
  | 'image_urls'
  | 'metadata'
  | 'last_updated'
  | 'source_search_url'
  | 'source_domain'
  | 'scrape_status'
  | 'scrape_version'
  | 'scraped_at'
  | 'score_version'
> & {
  brand?: ProductRow['brand']
  description: string | null
  price: number | null
  currency: string | null
  image_urls: string[] | null
  metadata?: ProductRow['metadata']
  last_updated?: ProductRow['last_updated']
  source_search_url?: ProductRow['source_search_url']
  source_domain?: ProductRow['source_domain']
  scrape_status?: ProductRow['scrape_status']
  scrape_version?: ProductRow['scrape_version']
  scraped_at?: ProductRow['scraped_at']
  score_version?: ProductRow['score_version']
}

export type AggregateInput = {
  query: string
  retailers?: string[]
  page?: number
}

export type SustainabilityResult = {
  score: number
  explanation: string   // one-sentence summary for product card
  reasoning: string     // 2-3 sentence detail for product modal (K2-Think chain)
  comparison: string    // e.g. "saves ~24 kg CO2 vs buying new"
}
