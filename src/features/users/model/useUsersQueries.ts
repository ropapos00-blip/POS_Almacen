import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AppRole } from '../../../shared/types/auth'
import type {
  CreateUserInput,
  DeactivateUserInput,
  ReactivateUserInput,
  StoreReceiptProfileInput,
  UpdateUserRoleInput,
} from './users.types'
import {
  createPosUser,
  deactivatePosUser,
  listUsersByStore,
  reactivatePosUser,
  updateStoreReceiptProfile,
  updateStoreName,
  updatePosUserRole,
} from '../services/usersService'

export function useUsersQuery(storeId?: string, viewerRole?: AppRole) {
  return useQuery({
    queryKey: ['users', 'store', storeId, viewerRole],
    queryFn: () => listUsersByStore(storeId as string, viewerRole),
    enabled: Boolean(storeId),
  })
}

export function useCreateUserMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateUserInput) => createPosUser(storeId as string, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users', 'store', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
      ])
    },
  })
}

export function useUpdateUserRoleMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateUserRoleInput) => updatePosUserRole(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users', 'store', storeId] })
    },
  })
}

export function useDeactivateUserMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DeactivateUserInput) => deactivatePosUser(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users', 'store', storeId] })
    },
  })
}

export function useReactivateUserMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ReactivateUserInput) => reactivatePosUser(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users', 'store', storeId] })
    },
  })
}

export function useUpdateStoreNameMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (storeName: string) => updateStoreName(storeId as string, storeName),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['users', 'store', storeId] }),
      ])
    },
  })
}

export function useUpdateStoreReceiptProfileMutation(storeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: StoreReceiptProfileInput) => updateStoreReceiptProfile(storeId as string, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['users', 'store', storeId] }),
      ])
    },
  })
}
