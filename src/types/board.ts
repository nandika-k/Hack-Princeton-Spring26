import type { Product } from './product'

export type Board = {
  id: string
  user_id: string
  name: string
  description: string | null
  occasion: string | null
  created_at: string
}

export type Pin = {
  id: string
  user_id: string
  board_id: string
  product_id: string
  product_data: Product
  sustainability_score: number | null
  created_at: string
}
