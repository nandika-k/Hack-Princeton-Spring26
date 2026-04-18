export type MaterialComponent = {
  name: string       // e.g. "Recycled Polyester", "Organic Cotton"
  percentage: number // 0-100
}

export type TagExtraction = {
  brand: string
  materials: MaterialComponent[]
  countryOfOrigin: string | null
  careInstructions: string[]
  rawText: string
}

// Full response from the analyze-tag edge function
export type TagAnalysisResult = {
  extraction: TagExtraction
  score: number
  explanation: string
  reasoning: string       // K2-Think v2 chain-of-thought summary
  comparison: string      // e.g. "saves ~25 kg CO₂ vs buying new"
  certifications: string[] // from Dedalus brand audit
  brandRating: string     // from Dedalus brand audit
  formattedReply: string  // SMS-ready summary
}
