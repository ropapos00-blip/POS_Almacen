import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useReactToPrint } from 'react-to-print'
import {
  categorySchema,
  productSchema,
  variantSchema,
} from '../../model/catalog.schemas'
import {
  useCategoriesQuery,
  useCategoryMutations,
  useProductMutations,
  useProductsQuery,
  useVariantMutations,
  useVariantsQuery,
} from '../../model/useCatalogQueries'
import { VariantBarcodeLabel } from '../../ui/VariantBarcodeLabel'
import { useAuthStore } from '../../../auth/model/useAuthStore'
import { formatCopInput, parseCopIntegerInput } from '../../../../shared/utils/numberInput'
import type {
  Category,
  CategoryInput,
  Product,
  ProductInput,
  ProductVariant,
  VariantInput,
} from '../../model/catalog.types'

function getErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : 'Operacion no completada.'
}

export function ProductsPage() {
  const storeId = useAuthStore((state) => state.user?.storeId)
  const [feedback, setFeedback] = useState<string | null>(null)

  const categoriesQuery = useCategoriesQuery(storeId)
  const productsQuery = useProductsQuery(storeId)
  const variantsQuery = useVariantsQuery(storeId)

  const categoryMutations = useCategoryMutations(storeId)
  const productMutations = useProductMutations(storeId)
  const variantMutations = useVariantMutations(storeId, productsQuery.data)

  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null)
  const [selectedLabelVariant, setSelectedLabelVariant] = useState<ProductVariant | null>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const handlePrintLabel = useReactToPrint({
    contentRef: labelRef,
    documentTitle: selectedLabelVariant?.sku ?? 'etiqueta-variant',
  })

  const categoryForm = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', slug: '' },
  })

  const productForm = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      categoryId: '',
      name: '',
      description: '',
      brand: '',
      gender: '',
      season: '',
    },
  })

  const variantForm = useForm<VariantInput>({
    resolver: zodResolver(variantSchema),
    defaultValues: {
      productId: '',
      size: '',
      color: '',
      costPrice: 0,
      salePrice: 0,
      sku: '',
      barcode: '',
    },
  })

  const categoryOptions = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const productOptions = useMemo(() => productsQuery.data ?? [], [productsQuery.data])

  const onCategorySubmit = categoryForm.handleSubmit(async (values) => {
    setFeedback(null)
    try {
      if (editingCategory) {
        await categoryMutations.updateMutation.mutateAsync({
          categoryId: editingCategory.id,
          input: values,
        })
        setFeedback('Categoria actualizada.')
      } else {
        await categoryMutations.createMutation.mutateAsync(values)
        setFeedback('Categoria creada.')
      }
      setEditingCategory(null)
      categoryForm.reset({ name: '', slug: '' })
    } catch (error) {
      setFeedback(getErrorMessage(error))
    }
  })

  const onProductSubmit = productForm.handleSubmit(async (values) => {
    setFeedback(null)
    try {
      if (editingProduct) {
        await productMutations.updateMutation.mutateAsync({
          productId: editingProduct.id,
          input: values,
        })
        setFeedback('Producto actualizado.')
      } else {
        await productMutations.createMutation.mutateAsync(values)
        setFeedback('Producto creado.')
      }
      setEditingProduct(null)
      productForm.reset({
        categoryId: '',
        name: '',
        description: '',
        brand: '',
        gender: '',
        season: '',
      })
    } catch (error) {
      setFeedback(getErrorMessage(error))
    }
  })

  const onVariantSubmit = variantForm.handleSubmit(async (values) => {
    setFeedback(null)
    try {
      if (editingVariant) {
        await variantMutations.updateMutation.mutateAsync({
          variantId: editingVariant.id,
          input: values,
        })
        setFeedback('Variante actualizada.')
      } else {
        await variantMutations.createMutation.mutateAsync(values)
        setFeedback('Variante creada.')
      }
      setEditingVariant(null)
      variantForm.reset({
        productId: '',
        size: '',
        color: '',
        costPrice: 0,
        salePrice: 0,
        sku: '',
        barcode: '',
      })
    } catch (error) {
      setFeedback(getErrorMessage(error))
    }
  })

  if (!storeId) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h1 className="text-2xl font-semibold text-zinc-100">Catalogo</h1>
        <p className="mt-2 text-zinc-400">
          No se encontro una tienda activa para tu usuario.
        </p>
      </section>
    )
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      {/* ── LEFT: forms ────────────────────────────────────────── */}
      <article className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <header>
          <h1 className="text-2xl font-semibold text-zinc-100">Catalogo</h1>
          <p className="mt-2 text-sm text-zinc-400">
            CRUD conectado a Supabase para categorias, productos y variantes.
          </p>
          {feedback ? <p className="mt-2 text-sm text-amber-300">{feedback}</p> : null}
          <button
            type="button"
            disabled={!selectedLabelVariant}
            onClick={() => {
              void handlePrintLabel()
            }}
            className="mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Imprimir etiqueta seleccionada
          </button>
        </header>

        {/* Categories form */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Categorias</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Organiza el catalogo por lineas de producto</p>
          <form className="mt-3 space-y-3" onSubmit={onCategorySubmit}>
            <input
              placeholder="Nombre"
              {...categoryForm.register('name')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <input
              placeholder="Slug"
              {...categoryForm.register('slug')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <button className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900">
              {editingCategory ? 'Actualizar categoria' : 'Crear categoria'}
            </button>
          </form>
        </div>

        {/* Products form */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Productos</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Informacion base para venta e inventario</p>
          <form className="mt-3 space-y-3" onSubmit={onProductSubmit}>
            <select
              {...productForm.register('categoryId')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            >
              <option value="">Selecciona categoria</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Nombre"
              {...productForm.register('name')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <input
              placeholder="Marca"
              {...productForm.register('brand')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <input
              placeholder="Genero"
              {...productForm.register('gender')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <input
              placeholder="Temporada"
              {...productForm.register('season')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Descripcion"
              {...productForm.register('description')}
              className="min-h-20 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <button className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900">
              {editingProduct ? 'Actualizar producto' : 'Crear producto'}
            </button>
          </form>
        </div>

        {/* Variants form */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Variantes</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Talla y color con precio, SKU y codigo de barras</p>
          <form className="mt-3 space-y-3" onSubmit={onVariantSubmit}>
            <select
              {...variantForm.register('productId')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            >
              <option value="">Selecciona producto</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Talla"
              {...variantForm.register('size')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <input
              placeholder="Color"
              {...variantForm.register('color')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <Controller
              control={variantForm.control}
              name="costPrice"
              render={({ field }) => (
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Costo"
                  value={field.value > 0 ? formatCopInput(field.value) : ''}
                  onChange={(event) => field.onChange(parseCopIntegerInput(event.target.value, 0))}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
                />
              )}
            />
            <Controller
              control={variantForm.control}
              name="salePrice"
              render={({ field }) => (
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Precio venta"
                  value={field.value > 0 ? formatCopInput(field.value) : ''}
                  onChange={(event) => field.onChange(parseCopIntegerInput(event.target.value, 0))}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
                />
              )}
            />
            <input
              placeholder="SKU (opcional)"
              {...variantForm.register('sku')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <input
              placeholder="Codigo barras (opcional)"
              {...variantForm.register('barcode')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            />
            <button className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900">
              {editingVariant ? 'Actualizar variante' : 'Crear variante'}
            </button>
          </form>
        </div>
      </article>

      {/* ── RIGHT: lists ───────────────────────────────────────── */}
      <article className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        {/* Categories list */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Lista de categorias</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{categoryOptions.length} categorias</p>
          <ul className="ghost-scrollbar mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
            {categoryOptions.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{item.name}</p>
                  <p className="text-xs text-zinc-500">{item.slug}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                    onClick={() => {
                      setEditingCategory(item)
                      categoryForm.reset({ name: item.name, slug: item.slug })
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-800 px-2 py-1 text-xs text-rose-300"
                    onClick={async () => {
                      try {
                        await categoryMutations.deleteMutation.mutateAsync(item.id)
                        setFeedback('Categoria eliminada.')
                      } catch (error) {
                        setFeedback(getErrorMessage(error))
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Products list */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Lista de productos</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{productOptions.length} productos</p>
          <ul className="ghost-scrollbar mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {productOptions.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{item.name}</p>
                  <p className="text-xs text-zinc-500">{item.brand ?? 'Sin marca'}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                    onClick={() => {
                      setEditingProduct(item)
                      productForm.reset({
                        categoryId: item.category_id,
                        name: item.name,
                        description: item.description ?? '',
                        brand: item.brand ?? '',
                        gender: item.gender ?? '',
                        season: item.season ?? '',
                      })
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-800 px-2 py-1 text-xs text-rose-300"
                    onClick={async () => {
                      try {
                        await productMutations.deleteMutation.mutateAsync(item.id)
                        setFeedback('Producto eliminado.')
                      } catch (error) {
                        setFeedback(getErrorMessage(error))
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Variants list */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Lista de variantes</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{variantsQuery.data?.length ?? 0} variantes</p>
          <ul className="ghost-scrollbar mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {(variantsQuery.data ?? []).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {item.sku} · {item.size} · {item.color}
                  </p>
                  <p className="text-xs text-zinc-500">Barcode: {item.barcode}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                    onClick={() => {
                      setEditingVariant(item)
                      variantForm.reset({
                        productId: item.product_id,
                        size: item.size,
                        color: item.color,
                        costPrice: item.cost_price,
                        salePrice: item.sale_price,
                        sku: item.sku,
                        barcode: item.barcode,
                      })
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-amber-600/40 px-2 py-1 text-xs text-amber-300"
                    onClick={() => setSelectedLabelVariant(item)}
                  >
                    Etiqueta
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-800 px-2 py-1 text-xs text-rose-300"
                    onClick={async () => {
                      try {
                        await variantMutations.deleteMutation.mutateAsync(item.id)
                        setFeedback('Variante eliminada.')
                      } catch (error) {
                        setFeedback(getErrorMessage(error))
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <VariantBarcodeLabel variant={selectedLabelVariant} labelRef={labelRef} />
    </section>
  )
}
