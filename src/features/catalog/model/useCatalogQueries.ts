import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../services/categoriesService'
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from '../services/productsService'
import {
  createVariant,
  deleteVariant,
  listVariants,
  updateVariant,
} from '../services/variantsService'
import type {
  CategoryInput,
  Product,
  ProductInput,
  VariantInput,
} from './catalog.types'

export function useCategoriesQuery(storeId?: string) {
  return useQuery({
    queryKey: ['catalog', 'categories', storeId],
    queryFn: () => listCategories(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useProductsQuery(storeId?: string) {
  return useQuery({
    queryKey: ['catalog', 'products', storeId],
    queryFn: () => listProducts(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useVariantsQuery(storeId?: string) {
  return useQuery({
    queryKey: ['catalog', 'variants', storeId],
    queryFn: () => listVariants(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useCategoryMutations(storeId?: string) {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['catalog', 'categories', storeId],
    })
  }

  return {
    createMutation: useMutation({
      mutationFn: (input: CategoryInput) => createCategory(storeId as string, input),
      onSuccess: invalidate,
    }),
    updateMutation: useMutation({
      mutationFn: ({
        categoryId,
        input,
      }: {
        categoryId: string
        input: CategoryInput
      }) => updateCategory(categoryId, input),
      onSuccess: invalidate,
    }),
    deleteMutation: useMutation({
      mutationFn: (categoryId: string) => deleteCategory(categoryId),
      onSuccess: invalidate,
    }),
  }
}

export function useProductMutations(storeId?: string) {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog', 'products', storeId] }),
      queryClient.invalidateQueries({ queryKey: ['catalog', 'variants', storeId] }),
    ])
  }

  return {
    createMutation: useMutation({
      mutationFn: (input: ProductInput) => createProduct(storeId as string, input),
      onSuccess: invalidate,
    }),
    updateMutation: useMutation({
      mutationFn: ({
        productId,
        input,
      }: {
        productId: string
        input: ProductInput
      }) => updateProduct(productId, input),
      onSuccess: invalidate,
    }),
    deleteMutation: useMutation({
      mutationFn: (productId: string) => deleteProduct(productId),
      onSuccess: invalidate,
    }),
  }
}

export function useVariantMutations(storeId?: string, products?: Product[]) {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['catalog', 'variants', storeId] })
  }

  return {
    createMutation: useMutation({
      mutationFn: (input: VariantInput) =>
        createVariant(storeId as string, products ?? [], input),
      onSuccess: invalidate,
    }),
    updateMutation: useMutation({
      mutationFn: ({
        variantId,
        input,
      }: {
        variantId: string
        input: VariantInput
      }) => updateVariant(variantId, input),
      onSuccess: invalidate,
    }),
    deleteMutation: useMutation({
      mutationFn: (variantId: string) => deleteVariant(variantId),
      onSuccess: invalidate,
    }),
  }
}
