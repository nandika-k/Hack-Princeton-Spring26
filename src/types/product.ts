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
  explanation: string
  comparison: string
}
