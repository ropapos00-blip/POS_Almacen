export type UserRoleCode = 'super_admin' | 'admin' | 'cashier'

export interface UserListRow {
  assignmentId: string
  userId: string
  fullName: string
  email: string
  roleCode: UserRoleCode
  roleName: string
  isActive: boolean
}

export interface CreateUserInput {
  fullName: string
  email: string
  password: string
  roleCode: 'admin' | 'cashier'
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
