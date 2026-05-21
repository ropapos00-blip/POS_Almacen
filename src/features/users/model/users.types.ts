export type UserRoleCode = 'super_admin' | 'admin' | 'cashier'

export interface UserListRow {
  assignmentId: string
  userId: string
  fullName: string
  email: string
  phone: string
  roleCode: UserRoleCode
  roleName: string
  isActive: boolean
}

export interface CreateUserInput {
  fullName: string
  email: string
  phone: string
  password: string
  roleCode: 'admin' | 'cashier'
}

export interface StoreReceiptProfileInput {
  loginSlogan: string
  loginSupportText: string
  legalName: string
  taxId: string
  taxRegime: string
  address: string
  city: string
  phone: string
}

export interface UpdateUserRoleInput {
  assignmentId: string
  roleCode: 'admin' | 'cashier'
}

export interface DeactivateUserInput {
  assignmentId: string
}

export interface ReactivateUserInput {
  assignmentId: string
}

export interface StoreNavVisibilityInput {
  hiddenRoutes: string[]
}

export interface StoreCashClosePermissionInput {
  allowCashierClose: boolean
}
