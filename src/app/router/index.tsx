import { Suspense } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../layouts/AppShell'
import { ProtectedRoute } from './ProtectedRoute'
import {
  DashboardPage,
  InventoryPage,
  LoginPage,
  ManualInvoicesPage,
  PriceCheckPage,
  PosPage,
  ProductsPage,
  SalesPage,
  UsersPage,
  WholesaleInventoryPage,
  WholesalePage,
} from './lazyPages'

function withFallback(node: React.ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-400">
          Cargando modulo...
        </div>
      }
    >
      {node}
    </Suspense>
  )
}

export const appRouter = createBrowserRouter([
  {
    path: '/login',
    element: withFallback(<LoginPage />),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: withFallback(<DashboardPage />),
      },
      {
        path: 'pos',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin', 'cashier']}>
            <PosPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'catalog',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <ProductsPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'price-check',
        element: withFallback(
          <ProtectedRoute roles={['cashier']}>
            <PriceCheckPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'inventory',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <InventoryPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'sales',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin', 'cashier']}>
            <SalesPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'ventas',
        element: <Navigate to="/sales" replace />,
      },
      {
        path: 'manual-invoices',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin', 'cashier']}>
            <ManualInvoicesPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'users',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <UsersPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'confeccion/dashboard',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <WholesalePage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'confeccion/ventas',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <WholesalePage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'confeccion/cartera',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <WholesalePage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'confeccion/gastos',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <WholesalePage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'confeccion/inventario',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <WholesaleInventoryPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'confeccion',
        element: <Navigate to="/confeccion/dashboard" replace />,
      },
      {
        path: 'wholesale',
        element: <Navigate to="/confeccion/dashboard" replace />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
