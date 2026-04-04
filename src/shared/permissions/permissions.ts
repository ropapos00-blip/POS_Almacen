import type { AppRole } from '../types/auth'

export type Permission =
  | 'dashboard:read'
  | 'inventory:read'
  | 'inventory:adjust'
  | 'catalog:read'
  | 'catalog:write'
  | 'sale:create'
  | 'sale:void'
  | 'users:read'
  | 'users:write'
  | 'audit:read'

const rolePermissions: Record<AppRole, Permission[]> = {
  super_admin: [
    'dashboard:read',
    'inventory:read',
    'inventory:adjust',
    'catalog:read',
    'catalog:write',
    'sale:create',
    'sale:void',
    'users:read',
    'users:write',
    'audit:read',
  ],
  admin: [
    'dashboard:read',
    'inventory:read',
    'inventory:adjust',
    'catalog:read',
    'catalog:write',
    'sale:create',
    'sale:void',
    'users:read',
    'users:write',
    'audit:read',
  ],
  cashier: ['dashboard:read', 'inventory:read', 'catalog:read', 'sale:create'],
}

export function hasPermission(role: AppRole, permission: Permission) {
  return rolePermissions[role].includes(permission)
}
