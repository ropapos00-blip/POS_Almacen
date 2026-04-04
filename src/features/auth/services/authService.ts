import type { User } from '@supabase/supabase-js'
import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { AppRole, SessionUser } from '../../../shared/types/auth'

interface UserStoreRoleRow {
  store_id: string
  role_id: string
}

interface RoleRow {
  code: string
}

interface ProfileRow {
  full_name: string
  email: string
}

function isAppRole(value: string): value is AppRole {
  return value === 'super_admin' || value === 'admin' || value === 'cashier'
}

async function getPrimaryRole(userId: string) {
  const { data, error } = await supabase
    .from('user_store_roles')
    .select('store_id, role_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle<UserStoreRoleRow>()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('No se encontro rol activo para el usuario.')
  }

  const { data: roleData, error: roleError } = await supabase
    .from('roles')
    .select('code')
    .eq('id', data.role_id)
    .maybeSingle<RoleRow>()

  if (roleError) {
    throw new Error(roleError.message)
  }

  if (!roleData?.code || !isAppRole(roleData.code)) {
    throw new Error('No se encontro rol valido para el usuario.')
  }

  return {
    role: roleData.code,
    storeId: data.store_id,
  }
}

async function getProfile(userId: string, fallbackEmail?: string | null) {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle<ProfileRow>()

  if (error) {
    throw new Error(error.message)
  }

  return {
    fullName: data?.full_name ?? fallbackEmail ?? 'Usuario',
    email: data?.email ?? fallbackEmail ?? '',
  }
}

export async function buildSessionUser(user: User): Promise<SessionUser> {
  const [roleData, profileData] = await Promise.all([
    getPrimaryRole(user.id),
    getProfile(user.id, user.email),
  ])

  return {
    id: user.id,
    email: profileData.email,
    fullName: profileData.fullName,
    role: roleData.role,
    storeId: roleData.storeId,
  }
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('No se pudo iniciar sesion.')
  }

  return buildSessionUser(data.user)
}

export async function signOutSession() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(error.message)
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error(error.message)
  }

  if (!data.session?.user) {
    return null
  }

  return buildSessionUser(data.session.user)
}
