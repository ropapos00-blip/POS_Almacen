import { create } from 'zustand'
import type { SessionUser, StoreReceiptProfile } from '../../../shared/types/auth'
import { cacheStoreName } from '../../../shared/utils/storeNameCache'
import { getSessionUser, signInWithPassword, signOutSession } from '../services/authService'

interface AuthState {
  isInitializing: boolean
  isLoading: boolean
  isAuthenticated: boolean
  user: SessionUser | null
  error: string | null
  hydrateSession: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  setStoreName: (storeName: string) => void
  setStoreSlogan: (storeSlogan: string) => void
  setStoreLoginSupportText: (storeLoginSupportText: string) => void
  setStoreReceipt: (storeReceipt: StoreReceiptProfile) => void
  setStoreHiddenNavRoutes: (storeHiddenNavRoutes: string[]) => void
  setStoreAllowCashierClose: (storeAllowCashierClose: boolean) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isInitializing: true,
  isLoading: false,
  isAuthenticated: false,
  user: null,
  error: null,
  hydrateSession: async () => {
    try {
      const user = await getSessionUser()
      set({
        isInitializing: false,
        isAuthenticated: Boolean(user),
        user,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de sesion.'
      // getSessionUser() solo llega aqui por un fallo transitorio (red, RLS, etc.),
      // no por "no hay sesion" (eso devuelve null sin lanzar). Si ya habia un
      // usuario autenticado, no lo borramos: eso apagaria todos los queries de la
      // app (enabled=Boolean(storeId)) y los KPIs caerian a 0 momentaneamente en
      // produccion. Solo se limpia el usuario si de verdad no habia sesion previa.
      if (get().user) {
        set({ isInitializing: false, error: message })
        return
      }
      set({
        isInitializing: false,
        isAuthenticated: false,
        user: null,
        error: message,
      })
    }
  },
  signIn: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const user = await signInWithPassword(email, password)
      set({
        isLoading: false,
        isAuthenticated: true,
        user,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesion.'
      set({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: message,
      })
      throw error
    }
  },
  signOut: async () => {
    try {
      await signOutSession()
      set({
        isAuthenticated: false,
        user: null,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cerrar sesion.'
      set({ error: message })
      throw error
    }
  },
  setStoreName: (storeName) => {
    cacheStoreName(storeName)
    set((state) => {
      if (!state.user) {
        return state
      }

      return {
        ...state,
        user: {
          ...state.user,
          storeName,
        },
      }
    })
  },
  setStoreSlogan: (storeSlogan) => {
    set((state) => {
      if (!state.user) {
        return state
      }

      return {
        ...state,
        user: {
          ...state.user,
          storeSlogan,
        },
      }
    })
  },
  setStoreLoginSupportText: (storeLoginSupportText) => {
    set((state) => {
      if (!state.user) {
        return state
      }

      return {
        ...state,
        user: {
          ...state.user,
          storeLoginSupportText,
        },
      }
    })
  },
  setStoreReceipt: (storeReceipt) => {
    set((state) => {
      if (!state.user) {
        return state
      }

      return {
        ...state,
        user: {
          ...state.user,
          storeReceipt,
        },
      }
    })
  },
  setStoreHiddenNavRoutes: (storeHiddenNavRoutes) => {
    set((state) => {
      if (!state.user) {
        return state
      }

      return {
        ...state,
        user: {
          ...state.user,
          storeHiddenNavRoutes,
        },
      }
    })
  },
  setStoreAllowCashierClose: (storeAllowCashierClose) => {
    set((state) => {
      if (!state.user) {
        return state
      }

      return {
        ...state,
        user: {
          ...state.user,
          storeAllowCashierClose,
        },
      }
    })
  },
}))
