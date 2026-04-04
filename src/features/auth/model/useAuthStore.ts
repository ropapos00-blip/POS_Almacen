import { create } from 'zustand'
import type { SessionUser } from '../../../shared/types/auth'
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
}

export const useAuthStore = create<AuthState>((set) => ({
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
}))
