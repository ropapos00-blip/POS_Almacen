export interface Category {
  id: string
  store_id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  store_id: string
  category_id: string
  name: string
  description: string | null
  brand: string | null
  gender: string | null
  season: string | null
  is_active: boolean
  created_at: string
}

export interface ProductVariant {
  id: string
  store_id: string
  product_id: string
  size: string
  color: string
  sku: string
  barcode: string
  cost_price: number
  sale_price: number
  is_active: boolean
  created_at: string
}

export interface CategoryInput {
  name: string
  slug: string
}

export interface ProductInput {
  categoryId: string
  name: string
  description?: string
  brand?: string
  gender?: string
  season?: string
}

export interface VariantInput {
  productId: string
  size: string
  color: string
  costPrice: number
  salePrice: number
  sku?: string
  barcode?: string
}
