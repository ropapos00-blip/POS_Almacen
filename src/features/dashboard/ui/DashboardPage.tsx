import { useAuthStore } from '../../auth/model/useAuthStore'
import { formatCop } from '../../../shared/utils/currency'
import { useDashboardKpisQuery } from '../model/useDashboardQueries'

export function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const storeId = useAuthStore((state) => state.user?.storeId)
  const kpisQuery = useDashboardKpisQuery(storeId)

  const data = kpisQuery.data
  const role = user?.role
  const isCashier = role === 'cashier'
  const isAdmin = role === 'admin'
  const isSuperAdmin = role === 'super_admin'

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="mt-2 text-zinc-400">
          Vista ejecutiva del negocio en tiempo real.
        </p>
        <p className="mt-2 inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
          Rol activo: {role ?? 'sin rol'}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="text-sm text-zinc-400">Ventas del dia</p>
          <p className="mt-3 text-2xl font-semibold text-zinc-100">{data?.salesToday ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="text-sm text-zinc-400">Ventas del mes</p>
          <p className="mt-3 text-2xl font-semibold text-zinc-100">{data?.salesMonth ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="text-sm text-zinc-400">Ticket promedio</p>
          <p className="mt-3 text-2xl font-semibold text-zinc-100">{formatCop(data?.averageTicket ?? 0)}</p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="text-sm text-zinc-400">Productos sin stock</p>
          <p className="mt-3 text-2xl font-semibold text-zinc-100">{data?.outOfStockCount ?? 0}</p>
        </article>
      </div>

      {isCashier ? (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="text-sm text-zinc-400">Vista operativa de caja</p>
          <p className="mt-2 text-zinc-300">
            Como cajero, enfocate en POS, ventas del dia y ticket promedio.
          </p>
        </article>
      ) : null}

      {(isAdmin || isSuperAdmin) ? (
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">Top productos</h2>
              <span className="text-xs text-zinc-500">Mes actual</span>
            </div>
            <ul className="mt-4 space-y-2">
              {(data?.topProducts ?? []).map((row) => (
                <li key={row.name} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <p className="text-sm font-medium text-zinc-200">{row.name}</p>
                  <p className="text-xs text-zinc-500">{row.quantity} uds · {formatCop(row.revenue)}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">Ventas por vendedor</h2>
              <span className="text-xs text-zinc-500">Mes actual</span>
            </div>
            <ul className="mt-4 space-y-2">
              {(data?.salesBySeller ?? []).map((row) => (
                <li key={row.sellerId} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <p className="text-sm font-medium text-zinc-200">{row.sellerName}</p>
                  <p className="text-xs text-zinc-500">{row.totalSales} ventas · {formatCop(row.revenue)}</p>
                </li>
              ))}
            </ul>
          </article>
        </div>
      ) : null}

      {(isAdmin || isSuperAdmin) ? (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="text-sm text-zinc-400">Productos de baja rotacion (30 dias)</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">{data?.lowRotationCount ?? 0}</p>
        </article>
      ) : null}

      {isSuperAdmin ? (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="text-sm text-zinc-400">Vista Super Admin</p>
          <p className="mt-2 text-zinc-300">
            Aqui luego agregaremos control global multi-sucursal, auditoria avanzada y gestion de usuarios.
          </p>
        </article>
      ) : null}

      <div className="hidden grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Top productos</h2>
            <span className="text-xs text-zinc-500">Mes actual</span>
          </div>
          <ul className="mt-4 space-y-2">
            {(data?.topProducts ?? []).map((row) => (
              <li key={row.name} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <p className="text-sm font-medium text-zinc-200">{row.name}</p>
                <p className="text-xs text-zinc-500">{row.quantity} uds · {formatCop(row.revenue)}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Ventas por vendedor</h2>
            <span className="text-xs text-zinc-500">Mes actual</span>
          </div>
          <ul className="mt-4 space-y-2">
            {(data?.salesBySeller ?? []).map((row) => (
              <li key={row.sellerId} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <p className="text-sm font-medium text-zinc-200">{row.sellerName}</p>
                <p className="text-xs text-zinc-500">{row.totalSales} ventas · {formatCop(row.revenue)}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {kpisQuery.isLoading ? <p className="text-sm text-zinc-500">Cargando KPI...</p> : null}
      {kpisQuery.error ? <p className="text-sm text-rose-400">No se pudieron cargar los KPI.</p> : null}
    </section>
  )
}
