import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createWholesaleFinanceMovement,
  createWholesaleInvoice,
  deleteWholesaleFinanceMovement,
  listWholesaleFinanceMovements,
  listWholesaleReferenceOptions,
  listWholesaleInvoices,
  registerWholesalePayment,
  updateWholesaleInvoice,
  updateWholesaleInvoiceHeader,
  voidWholesaleInvoice,
} from '../services/wholesaleService'
import {
  createWholesaleReference,
  deleteAllWholesaleReferences,
  deleteWholesaleReference,
  listWholesaleInventoryStock,
  listWholesaleReferenceInvestmentMovements,
  updateWholesaleReference,
  updateWholesaleReferenceInvestmentMovement,
} from '../services/wholesaleInventoryService'
import type {
  CreateWholesaleInvoiceInput,
  CreateWholesaleFinanceMovementInput,
  CreateWholesaleReferenceInput,
  RegisterWholesalePaymentInput,
  UpdateWholesaleReferenceInvestmentMovementInput,
  UpdateWholesaleInvoiceInput,
  UpdateWholesaleInvoiceHeaderInput,
  UpdateWholesaleReferenceInput,
} from './wholesale.types'

export function useWholesaleInvoicesQuery(storeId?: string) {
  return useQuery({
    queryKey: ['wholesale', 'invoices', 'list', storeId],
    queryFn: () => listWholesaleInvoices(storeId as string),
    enabled: Boolean(storeId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
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

export function useUpdateWholesaleInvoiceMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateWholesaleInvoiceInput) => updateWholesaleInvoice(input),
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
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })
}

export function useWholesaleFinanceMovementsQuery(storeId?: string) {
  return useQuery({
    queryKey: ['wholesale', 'finance-movements', storeId],
    queryFn: () => listWholesaleFinanceMovements(storeId as string),
    enabled: Boolean(storeId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })
}

export function useCreateWholesaleFinanceMovementMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWholesaleFinanceMovementInput) => createWholesaleFinanceMovement(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'finance-movements', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useDeleteWholesaleFinanceMovementMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ movementId, kind }: { movementId: string; kind: 'expense' | 'investment' }) =>
      deleteWholesaleFinanceMovement(storeId as string, movementId, kind),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'finance-movements', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useWholesaleInventoryStockQuery(storeId?: string) {
  return useQuery({
    queryKey: ['wholesale', 'inventory', storeId],
    queryFn: () => listWholesaleInventoryStock(storeId as string),
    enabled: Boolean(storeId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
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
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'finance-movements', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useDeleteAllWholesaleReferencesMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => deleteAllWholesaleReferences(storeId as string),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'reference-options', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'finance-movements', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useWholesaleReferenceInvestmentMovementsQuery(storeId?: string, referenceId?: string) {
  return useQuery({
    queryKey: ['wholesale', 'reference-investments', storeId, referenceId],
    queryFn: () => listWholesaleReferenceInvestmentMovements(storeId as string, referenceId as string),
    enabled: Boolean(storeId && referenceId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })
}

export function useUpdateWholesaleReferenceInvestmentMovementMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateWholesaleReferenceInvestmentMovementInput) =>
      updateWholesaleReferenceInvestmentMovement(storeId as string, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'reference-investments', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['wholesale', 'finance-movements', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}