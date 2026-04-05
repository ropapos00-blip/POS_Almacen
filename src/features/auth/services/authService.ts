import type { User } from '@supabase/supabase-js'
import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import type { AppRole, SessionUser } from '../../../shared/types/auth'
import { cacheStoreName } from '../../../shared/utils/storeNameCache'

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

interface StoreRow {
  name: string
  login_slogan: string | null
  login_support_text: string | null
  receipt_legal_name: string | null
  receipt_tax_id: string | null
  receipt_tax_regime: string | null
  receipt_address: string | null
  receipt_city: string | null
  receipt_phone: string | null
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

async function getStoreName(storeId: string) {
  const { data, error } = await supabase
    .from('stores')
    .select('name, login_slogan, login_support_text, receipt_legal_name, receipt_tax_id, receipt_tax_regime, receipt_address, receipt_city, receipt_phone')
    .eq('id', storeId)
    .maybeSingle<StoreRow>()

  if (error) {
    return {
      storeName: 'POS Retail',
      storeSlogan: 'Cada venta cuenta, cada cliente vuelve',
      storeLoginSupportText:
        'Controla inventario, ventas y equipo desde un solo punto, con una experiencia rapida y clara.',
      storeReceipt: {
        legalName: '',
        taxId: '',
        taxRegime: '',
        address: '',
        city: '',
        phone: '',
      },
    }
  }

  return {
    storeName: data?.name ?? 'POS Retail',
    storeSlogan: data?.login_slogan?.trim() || 'Cada venta cuenta, cada cliente vuelve',
    storeLoginSupportText:
      data?.login_support_text?.trim() ||
      'Controla inventario, ventas y equipo desde un solo punto, con una experiencia rapida y clara.',
    storeReceipt: {
      legalName: data?.receipt_legal_name ?? '',
      taxId: data?.receipt_tax_id ?? '',
      taxRegime: data?.receipt_tax_regime ?? '',
      address: data?.receipt_address ?? '',
      city: data?.receipt_city ?? '',
      phone: data?.receipt_phone ?? '',
    },
  }
}

export async function buildSessionUser(user: User): Promise<SessionUser> {
  const roleData = await getPrimaryRole(user.id)
  const [profileData, storeData] = await Promise.all([
    getProfile(user.id, user.email),
    getStoreName(roleData.storeId),
  ])

  const sessionUser = {
    id: user.id,
    email: profileData.email,
    fullName: profileData.fullName,
    role: roleData.role,
    storeId: roleData.storeId,
    storeName: storeData.storeName,
    storeSlogan: storeData.storeSlogan,
    storeLoginSupportText: storeData.storeLoginSupportText,
    storeReceipt: storeData.storeReceipt,
  }

  cacheStoreName(sessionUser.storeName)

  return sessionUser
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
