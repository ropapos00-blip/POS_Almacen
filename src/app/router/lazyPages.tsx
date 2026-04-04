import { lazy } from 'react'

export const LoginPage = lazy(() =>
  import('../../features/auth/ui/LoginPage.tsx').then((m) => ({ default: m.LoginPage })),
)

export const DashboardPage = lazy(() =>
  import('../../features/dashboard/ui/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
)

export const PosPage = lazy(() =>
  import('../../features/pos/ui/PosPage').then((m) => ({ default: m.PosPage })),
)

export const ProductsPage = lazy(() =>
  import('../../features/catalog/products/ui/ProductsPage').then((m) => ({
    default: m.ProductsPage,
  })),
)

export const InventoryPage = lazy(() =>
  import('../../features/inventory/ui/InventoryPage').then((m) => ({
    default: m.InventoryPage,
  })),
)

export const SalesPage = lazy(() =>
  import('../../features/sales/ui/SalesPage').then((m) => ({ default: m.SalesPage })),
)

export const UsersPage = lazy(() =>
  import('../../features/users/ui/UsersPage').then((m) => ({ default: m.UsersPage })),
)

export const PriceCheckPage = lazy(() =>
  import('../../features/price-check/ui/PriceCheckPage').then((m) => ({
    default: m.PriceCheckPage,
  })),
)
