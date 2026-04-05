export type AppRole = 'super_admin' | 'admin' | 'cashier'

export interface StoreReceiptProfile {
  legalName: string
  taxId: string
  taxRegime: string
  address: string
  city: string
  phone: string
}

export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: AppRole
  storeId: string
  storeName: string
  storeSlogan: string
  storeLoginSupportText: string
  storeReceipt: StoreReceiptProfile
}
