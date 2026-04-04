import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/model/useAuthStore'
import type { AppRole } from '../../shared/types/auth'

export function ProtectedRoute({
  roles,
  children,
}: {
  roles?: AppRole[]
  children: ReactNode
}) {
  const isInitializing = useAuthStore((state) => state.isInitializing)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const userRole = useAuthStore((state) => state.user?.role)

  if (isInitializing) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-300">
        Validando sesion...
      </div>
    )
  }

  if (!isAuthenticated || !userRole) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
