import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createManualInvoice,
  listManualInvoices,
  updateManualInvoiceHeader,
  voidManualInvoice,
} from '../services/manualInvoicesService'
import type {
  CreateManualInvoiceInput,
  UpdateManualInvoiceHeaderInput,
  VoidManualInvoiceInput,
} from './manualInvoices.types'

export function useManualInvoicesQuery(storeId?: string) {
  return useQuery({
    queryKey: ['manual-invoices', 'list', storeId],
    queryFn: () => listManualInvoices(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useCreateManualInvoiceMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateManualInvoiceInput) => createManualInvoice(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useUpdateManualInvoiceMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateManualInvoiceHeaderInput) => updateManualInvoiceHeader(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useVoidManualInvoiceMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: VoidManualInvoiceInput) => voidManualInvoice(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}
