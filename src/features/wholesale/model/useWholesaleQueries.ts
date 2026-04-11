import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createWholesaleInvoice,
  listWholesaleReferenceOptions,
  listWholesaleInvoices,
  registerWholesalePayment,
  updateWholesaleInvoiceHeader,
  voidWholesaleInvoice,
} from '../services/wholesaleService'
import {
  createWholesaleReference,
  deleteWholesaleReference,
  listWholesaleInventoryStock,
  updateWholesaleReference,
} from '../services/wholesaleInventoryService'
import type {
  CreateWholesaleInvoiceInput,
  CreateWholesaleReferenceInput,
  RegisterWholesalePaymentInput,
  UpdateWholesaleInvoiceHeaderInput,
  UpdateWholesaleReferenceInput,
} from './wholesale.types'

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

export function useUpdateWholesaleInvoiceHeaderMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateWholesaleInvoiceHeaderInput) => updateWholesaleInvoiceHeader(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'invoices', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useVoidWholesaleInvoiceMutation(storeId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (invoiceId: string) => voidWholesaleInvoice(invoiceId, userId as string),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'invoices', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'reference-options', storeId] }),
      ])
    },
  })
}

export function useWholesaleReferenceOptionsQuery(storeId?: string) {
  return useQuery({
    queryKey: ['wholesale', 'reference-options', storeId],
    queryFn: () => listWholesaleReferenceOptions(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useWholesaleInventoryStockQuery(storeId?: string) {
  return useQuery({
    queryKey: ['wholesale', 'inventory', storeId],
    queryFn: () => listWholesaleInventoryStock(storeId as string),
    enabled: Boolean(storeId),
  })
}

export function useCreateWholesaleReferenceMutation(storeId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWholesaleReferenceInput) =>
      createWholesaleReference(storeId as string, userId as string, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'reference-options', storeId] }),
      ])
    },
  })
}

export function useUpdateWholesaleReferenceMutation(storeId?: string, userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateWholesaleReferenceInput) =>
      updateWholesaleReference(storeId as string, userId as string, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'reference-options', storeId] }),
      ])
    },
  })
}

export function useDeleteWholesaleReferenceMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (referenceId: string) => deleteWholesaleReference(storeId as string, referenceId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'reference-options', storeId] }),
      ])
    },
  })
}