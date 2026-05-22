import { lazyWithRetry } from './lazyWithRetry'

export const LoginPage = lazyWithRetry(() =>
  import('../../features/auth/ui/LoginPage.tsx').then((m) => ({ default: m.LoginPage })),
)

export const DashboardPage = lazyWithRetry(() =>
  import('../../features/dashboard/ui/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
)

export const PosPage = lazyWithRetry(() =>
  import('../../features/pos/ui/PosPage').then((m) => ({ default: m.PosPage })),
)

export const InventoryPage = lazyWithRetry(() =>
  import('../../features/inventory/ui/InventoryPage').then((m) => ({
    default: m.InventoryPage,
  })),
)

export const StockPage = lazyWithRetry(() =>
  import('../../features/inventory/ui/StockPage').then((m) => ({
    default: m.StockPage,
  })),
)

export const SalesPage = lazyWithRetry(() =>
  import('../../features/sales/ui/SalesPage').then((m) => ({ default: m.SalesPage })),
)

export const UsersPage = lazyWithRetry(() =>
  import('../../features/users/ui/UsersPage').then((m) => ({ default: m.UsersPage })),
)

export const PriceCheckPage = lazyWithRetry(() =>
  import('../../features/price-check/ui/PriceCheckPage').then((m) => ({
    default: m.PriceCheckPage,
  })),
)

export const ManualInvoicesPage = lazyWithRetry(() =>
  import('../../features/manual-invoices/ui/ManualInvoicesPage').then((m) => ({
    default: m.ManualInvoicesPage,
  })),
)

export const GastosPage = lazyWithRetry(() =>
  import('../../features/manual-invoices/ui/GastosPage').then((m) => ({
    default: m.GastosPage,
  })),
)

export const DevolucionesPage = lazyWithRetry(() =>
  import('../../features/manual-invoices/ui/DevolucionesPage').then((m) => ({
    default: m.DevolucionesPage,
  })),
)

export const WholesalePage = lazyWithRetry(() =>
  import('../../features/wholesale/ui/WholesalePage').then((m) => ({
    default: m.WholesalePage,
  })),
)

export const CierresCajaPage = lazyWithRetry(() =>
  import('../../features/cash-register/ui/CierresCajaPage').then((m) => ({
    default: m.CierresCajaPage,
  })),
)

export const CustomersRetailPage = lazyWithRetry(() =>
  import('../../features/customers/ui/CustomersPage').then((m) => ({
    default: m.CustomersPage,
  })),
)

export const WholesaleInventoryPage = lazyWithRetry(() =>
  import('../../features/wholesale/ui/WholesaleInventoryPage').then((m) => ({
    default: m.WholesaleInventoryPage,
  })),
)

export const ClientesPage = lazyWithRetry(() =>
  import('../../features/wholesale/ui/ClientesPage').then((m) => ({
    default: m.ClientesPage,
  })),
)

export const LayawaysPage = lazyWithRetry(() =>
  import('../../features/layaways/ui/LayawaysPage').then((m) => ({
    default: m.LayawaysPage,
  })),
)
