export type AppRole = 'super_admin' | 'admin' | 'cashier'

export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: AppRole
  storeId: string
  storeName: string
}
