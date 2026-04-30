// KPIs de cierre de caja por método de pago
import { listManualInvoicePaymentKpis } from '../services/manualInvoicesService';

export function useManualInvoicePaymentKpisQuery(storeId?: string, enabled = true, filterDate?: string) {
  return useQuery({
    queryKey: ['manual-invoices', 'payment-kpis', storeId, filterDate],
    queryFn: () => listManualInvoicePaymentKpis(storeId as string, filterDate),
    enabled: Boolean(storeId) && enabled,
  });
}
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createManualExpense,
  createManualInvoice,
  deleteManualExpense,
  listManualExpenseKpis,
  listManualExpenses,
  listManualInvoiceKpis,
  listManualInvoices,
  updateManualExpense,
  updateManualInvoiceHeader,
  voidManualInvoice,
} from '../services/manualInvoicesService'
import type {
  CreateManualExpenseInput,
  CreateManualInvoiceInput,
  DeleteManualExpenseInput,
  UpdateManualExpenseInput,
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

export function useManualInvoiceKpisQuery(storeId?: string, enabled = true) {
  return useQuery({
    queryKey: ['manual-invoices', 'kpis', storeId],
    queryFn: () => listManualInvoiceKpis(storeId as string),
    enabled: Boolean(storeId) && enabled,
  })
}

export function useManualExpensesQuery(storeId?: string, enabled = true) {
  return useQuery({
    queryKey: ['manual-invoices', 'expenses', 'list', storeId],
    queryFn: () => listManualExpenses(storeId as string),
    enabled: Boolean(storeId) && enabled,
  })
}

export function useManualExpenseKpisQuery(storeId?: string, enabled = true) {
  return useQuery({
    queryKey: ['manual-invoices', 'expenses', 'kpis', storeId],
    queryFn: () => listManualExpenseKpis(storeId as string),
    enabled: Boolean(storeId) && enabled,
  })
}

export function useCreateManualInvoiceMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateManualInvoiceInput) => createManualInvoice(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'kpis', storeId] }),
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
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'kpis', storeId] }),
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
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'kpis', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useCreateManualExpenseMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateManualExpenseInput) => createManualExpense(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'expenses', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'expenses', 'kpis', storeId] }),
      ])
    },
  })
}

export function useUpdateManualExpenseMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateManualExpenseInput) => updateManualExpense(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'expenses', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'expenses', 'kpis', storeId] }),
      ])
    },
  })
}

export function useDeleteManualExpenseMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DeleteManualExpenseInput) => deleteManualExpense(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'expenses', 'list', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['manual-invoices', 'expenses', 'kpis', storeId] }),
      ])
    },
  })
}
