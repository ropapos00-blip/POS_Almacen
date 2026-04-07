import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createWholesaleInvoice,
  listWholesaleInvoices,
  registerWholesalePayment,
} from '../services/wholesaleService'
import type { CreateWholesaleInvoiceInput, RegisterWholesalePaymentInput } from './wholesale.types'

export function useWholesaleInvoicesQuery(storeId?: string) {
  return useQuery({
    queryKey: ['wholesale', 'invoices', 'list', storeId],
    queryFn: () => listWholesaleInvoices(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useCreateWholesaleInvoiceMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWholesaleInvoiceInput) => createWholesaleInvoice(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'invoices', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useRegisterWholesalePaymentMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RegisterWholesalePaymentInput) => registerWholesalePayment(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'invoices', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}