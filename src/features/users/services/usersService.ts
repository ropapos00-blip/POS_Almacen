import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { AppRole } from '../../../shared/types/auth'
import type {
  CreateUserInput,
  DeactivateUserInput,
  ReactivateUserInput,
  UpdateUserRoleInput,
  UserListRow,
} from '../model/users.types'

interface AssignmentRow {
  id: string
  user_id: string
  is_active: boolean
  profiles:
    | {
        full_name: string | null
        email: string | null
      }
    | Array<{
        full_name: string | null
        email: string | null
      }>
    | null
  roles:
    | {
        code: string | null
        name: string | null
      }
    | Array<{
        code: string | null
        name: string | null
      }>
    | null
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function listUsersByStore(storeId: string, viewerRole?: AppRole) {
  const { data, error } = await supabase
    .from('user_store_roles')
    .select('id, user_id, is_active, profiles(full_name, email), roles(code, name)')
    .eq('store_id', storeId)
    .order('assigned_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const rows = ((data ?? []) as AssignmentRow[]).map((row) => {
    const profile = pickOne(row.profiles)
    const role = pickOne(row.roles)

    return {
      assignmentId: row.id,
      userId: row.user_id,
      fullName: profile?.full_name ?? 'Usuario',
      email: profile?.email ?? '',
      roleCode: (role?.code as UserListRow['roleCode']) ?? 'cashier',
      roleName: role?.name ?? 'Cajero',
      isActive: row.is_active,
    }
  })

  if (viewerRole === 'admin') {
    return rows.filter((row) => row.roleCode !== 'super_admin')
  }

  return rows
}

export async function createPosUser(storeId: string, input: CreateUserInput) {
  const { data, error } = await supabase.rpc('create_pos_user', {
    p_email: input.email.trim().toLowerCase(),
    p_password: input.password,
    p_full_name: input.fullName.trim(),
    p_store_id: storeId,
    p_role_code: input.roleCode,
  })

  if (error) {
    if (error.code === 'PGRST202' || error.message.toLowerCase().includes('create_pos_user')) {
      throw new Error(
        'No existe la funcion RPC create_pos_user en Supabase. Ejecuta de nuevo el script 06_user_management_rpc.sql y reintenta.',
      )
    }

    if (error.message.toLowerCase().includes('ya existe un usuario')) {
      throw new Error('El usuario ya existe con ese email.')
    }

    throw new Error(error.message)
  }

  return data
}

export async function updatePosUserRole(input: UpdateUserRoleInput) {
  const { data, error } = await supabase.rpc('update_pos_user_role', {
    p_assignment_id: input.assignmentId,
    p_role_code: input.roleCode,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function deactivatePosUser(input: DeactivateUserInput) {
  const { data, error } = await supabase.rpc('deactivate_pos_user', {
    p_assignment_id: input.assignmentId,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function reactivatePosUser(input: ReactivateUserInput) {
  const { data, error } = await supabase.rpc('reactivate_pos_user', {
    p_assignment_id: input.assignmentId,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function updateStoreName(storeId: string, storeName: string) {
  const normalizedName = storeName.trim()
  if (normalizedName.length < 3) {
    throw new Error('El nombre del almacen debe tener al menos 3 caracteres.')
  }

  const { data, error } = await supabase.rpc('update_store_name', {
    p_store_id: storeId,
    p_store_name: normalizedName,
  })

  if (error) {
    if (error.code === 'PGRST202' || error.message.toLowerCase().includes('update_store_name')) {
      throw new Error(
        'No existe la funcion RPC update_store_name en Supabase. Ejecuta el script 09_update_store_name_rpc.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  return (data?.[0]?.out_store_name as string | undefined) ?? normalizedName
}
