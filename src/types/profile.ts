export type Profile = {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export type StylePreference = {
  id: string
  user_id: string
  style_tags: string[]
  occasions: string[]
  style_text: string | null
  created_at: string
}

export const STYLE_TAGS = [
  'Y2K',
  'Vintage 90s',
  'Streetwear',
  'Boho',
  'Dark Academia',
  'Cottagecore',
  'Minimalist',
] as const

export const OCCASIONS = [
  'Prom',
  'Wedding',
  'Everyday',
  'Work',
  'Date Night',
] as const

export type StyleTag = typeof STYLE_TAGS[number]
export type Occasion = typeof OCCASIONS[number]
