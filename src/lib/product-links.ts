import { isProductListingVisible } from './product-scrape'
import type { Product } from '../types/product'

export function resolveProductLookupUrl(product: Product): string | null {
  if (isProductListingVisible(product)) {
    return product.product_url
  }

  return null
}
