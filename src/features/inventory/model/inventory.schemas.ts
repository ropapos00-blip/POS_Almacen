import { z } from 'zod'

export const stockAdjustmentSchema = z.object({
  stockId: z.string().uuid('Stock invalido'),
  variantId: z.string().uuid('Variante invalida'),
  currentQuantity: z.number(),
  delta: z.number().int('Debe ser entero').refine((v) => v !== 0, {
    message: 'El ajuste no puede ser cero',
  }),
  reason: z.string().trim().min(3, 'Motivo minimo 3 caracteres').max(180),
})
