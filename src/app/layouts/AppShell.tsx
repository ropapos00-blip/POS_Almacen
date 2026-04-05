import { FileText, LogOut, Package, ReceiptText, ShoppingCart, Store } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/model/useAuthStore'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: Store },
  { to: '/pos', label: 'POS', icon: ShoppingCart },
  { to: '/sales', label: 'Ventas', icon: ReceiptText },
  { to: '/manual-invoices', label: 'Factura manual', icon: FileText },
  { to: '/price-check', label: 'Consulta', icon: Package, roles: ['cashier'] },
  { to: '/catalog', label: 'Catalogo', icon: Package, roles: ['super_admin', 'admin'] },
  { to: '/inventory', label: 'Inventario', icon: ReceiptText, roles: ['super_admin', 'admin'] },
  { to: '/users', label: 'Usuarios', icon: Store, roles: ['super_admin', 'admin'] },
]

export function AppShell() {
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)

  const visibleNavItems = navItems.filter((item) => {
    if (!('roles' in item) || !item.roles) {
      return true
    }
    return user?.role ? item.roles.includes(user.role) : false
  })

  async function handleSignOut() {
    try {
      await signOut()
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#0a0a0a_45%)] text-zinc-100">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 backdrop-blur">
          <div className="mb-6 border-b border-zinc-800 pb-4">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400">
              {user?.storeName ?? 'POS Retail'}
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-300">{user?.fullName}</p>
            <p className="text-xs text-zinc-500">Rol: {user?.role}</p>
          </div>

          <nav className="space-y-2">
            {visibleNavItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-amber-400 text-zinc-950'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`
                  }
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={() => {
              void handleSignOut()
            }}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            <LogOut size={16} />
            Salir
          </button>
        </aside>

        <main className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 backdrop-blur">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
