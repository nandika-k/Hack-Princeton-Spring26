export type Product = {
  id: string
  retailer: string
  title: string
  description: string
  price: number
  currency: string
  image_urls: string[]
  product_url: string
  sustainability_score: number | null
  score_explanation: string | null
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
  comparison: string    // e.g. "saves ~24 kg CO₂ vs buying new"
}
