import type { Tables } from '../integrations/supabase/types'

type ProductRow = Tables<'products'>

export type Product = Omit<
  ProductRow,
  'description' | 'price' | 'currency' | 'image_urls' | 'metadata' | 'last_updated'
> & {
  description: string | null
  price: number | null
  currency: string | null
  image_urls: string[] | null
  metadata?: ProductRow['metadata']
  last_updated?: ProductRow['last_updated']
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
