import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { AppRole } from '../../../shared/types/auth'
import type {
  CreateUserInput,
  DeactivateUserInput,
  ReactivateUserInput,
  StoreReceiptProfileInput,
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
        phone: string | null
      }
    | Array<{
        full_name: string | null
        email: string | null
        phone: string | null
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
    .select('id, user_id, is_active, profiles(full_name, email, phone), roles(code, name)')
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
      phone: profile?.phone ?? '',
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
    p_phone: input.phone.trim() || null,
    p_store_id: storeId,
    p_role_code: input.roleCode,
  })

  if (error) {
    if (error.code === 'PGRST202' || error.message.toLowerCase().includes('create_pos_user')) {
      throw new Error(
        'No existe la funcion RPC create_pos_user en Supabase. Ejecuta el script 10_store_receipt_and_manual_invoice.sql (o 06_user_management_rpc.sql + 10) y reintenta.',
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

export async function updateStoreReceiptProfile(storeId: string, input: StoreReceiptProfileInput) {
  const { data, error } = await supabase.rpc('update_store_receipt_profile', {
    p_store_id: storeId,
    p_login_slogan: input.loginSlogan.trim() || null,
    p_login_support_text: input.loginSupportText.trim() || null,
    p_receipt_legal_name: input.legalName.trim() || null,
    p_receipt_tax_id: input.taxId.trim() || null,
    p_receipt_tax_regime: input.taxRegime.trim() || null,
    p_receipt_address: input.address.trim() || null,
    p_receipt_city: input.city.trim() || null,
    p_receipt_phone: input.phone.trim() || null,
  })

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message.toLowerCase().includes('update_store_receipt_profile')
    ) {
      throw new Error(
        'No existe la funcion RPC update_store_receipt_profile en Supabase. Ejecuta el script 10_store_receipt_and_manual_invoice.sql y reintenta.',
      )
    }

    throw new Error(error.message)
  }

  const row = data?.[0]

  return {
    loginSlogan: (row?.out_login_slogan as string | null | undefined) ?? '',
    loginSupportText: (row?.out_login_support_text as string | null | undefined) ?? '',
    legalName: (row?.out_receipt_legal_name as string | null | undefined) ?? '',
    taxId: (row?.out_receipt_tax_id as string | null | undefined) ?? '',
    taxRegime: (row?.out_receipt_tax_regime as string | null | undefined) ?? '',
    address: (row?.out_receipt_address as string | null | undefined) ?? '',
    city: (row?.out_receipt_city as string | null | undefined) ?? '',
    phone: (row?.out_receipt_phone as string | null | undefined) ?? '',
  }
}
