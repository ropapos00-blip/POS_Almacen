import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Minimo 2 caracteres').max(120, 'Maximo 120 caracteres'),
  slug: z
    .string()
    .trim()
    .min(2, 'Minimo 2 caracteres')
    .max(120, 'Maximo 120 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Solo minusculas, numeros y guiones'),
})

export const productSchema = z.object({
  categoryId: z.string().uuid('Selecciona categoria valida'),
  name: z.string().trim().min(2, 'Minimo 2 caracteres').max(160, 'Maximo 160 caracteres'),
  description: z.string().trim().max(300, 'Maximo 300 caracteres').optional(),
  brand: z.string().trim().max(80, 'Maximo 80 caracteres').optional(),
  gender: z.string().trim().max(40, 'Maximo 40 caracteres').optional(),
  season: z.string().trim().max(40, 'Maximo 40 caracteres').optional(),
})

export const variantSchema = z.object({
  productId: z.string().uuid('Selecciona producto valido'),
  size: z.string().trim().min(1, 'Talla requerida').max(24, 'Maximo 24 caracteres'),
  color: z.string().trim().min(1, 'Color requerido').max(40, 'Maximo 40 caracteres'),
  costPrice: z.number().min(0, 'No puede ser negativo'),
  salePrice: z.number().positive('Debe ser mayor que 0'),
  sku: z.string().trim().max(40, 'Maximo 40 caracteres').optional(),
  barcode: z.string().trim().max(40, 'Maximo 40 caracteres').optional(),
})
