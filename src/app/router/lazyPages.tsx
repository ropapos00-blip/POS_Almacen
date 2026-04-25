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

export const InventoryPage = lazy(() =>
  import('../../features/inventory/ui/InventoryPage').then((m) => ({
    default: m.InventoryPage,
  })),
)

export const StockPage = lazy(() =>
  import('../../features/inventory/ui/StockPage').then((m) => ({
    default: m.StockPage,
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

export const ManualInvoicesPage = lazy(() =>
  import('../../features/manual-invoices/ui/ManualInvoicesPage').then((m) => ({
    default: m.ManualInvoicesPage,
  })),
)

export const WholesalePage = lazy(() =>
  import('../../features/wholesale/ui/WholesalePage').then((m) => ({
    default: m.WholesalePage,
  })),
)

export const CustomersRetailPage = lazy(() =>
  import('../../features/customers/ui/CustomersPage').then((m) => ({
    default: m.CustomersPage,
  })),
)

export const WholesaleInventoryPage = lazy(() =>
  import('../../features/wholesale/ui/WholesaleInventoryPage').then((m) => ({
    default: m.WholesaleInventoryPage,
  })),
)

export const ClientesPage = lazy(() =>
  import('../../features/wholesale/ui/ClientesPage').then((m) => ({
    default: m.ClientesPage,
  })),
)

export const LayawaysPage = lazy(() =>
  import('../../features/layaways/ui/LayawaysPage').then((m) => ({
    default: m.LayawaysPage,
  })),
)
