import { Suspense } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/model/useAuthStore'
import { AppShell } from '../layouts/AppShell'
import { ProtectedRoute } from './ProtectedRoute'
import {
  DashboardPage,
  ClientesPage,
  CierresCajaPage,
  DevolucionesPage,
  CustomersRetailPage,
  GastosPage,
  InventoryPage,
  LayawaysPage,
  StockPage,
  LoginPage,
  ManualInvoicesPage,
  PriceCheckPage,
  PosPage,
  SalesPage,
  UsersPage,
  WholesaleInventoryPage,
  WholesalePage,
} from './lazyPages'

function RootRedirect() {
  const role = useAuthStore((state) => state.user?.role)
  return <Navigate to={role === 'cashier' ? '/manual-invoices' : '/dashboard'} replace />
}

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
        element: <RootRedirect />,
      },
      {
        path: 'dashboard',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <DashboardPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'pos',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <PosPage />
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
        path: 'stock',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <StockPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'sales',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
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
        path: 'gastos',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin', 'cashier']}>
            <GastosPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'devoluciones',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin', 'cashier']}>
            <DevolucionesPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'layaways',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin', 'cashier']}>
            <LayawaysPage />
          </ProtectedRoute>,
        ),
      },
      {
        path: 'customers',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin', 'cashier']}>
            <CustomersRetailPage />
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
        path: 'cierre-caja',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin', 'cashier']}>
            <CierresCajaPage />
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
        path: 'confeccion/clientes',
        element: withFallback(
          <ProtectedRoute roles={['super_admin', 'admin']}>
            <ClientesPage />
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
