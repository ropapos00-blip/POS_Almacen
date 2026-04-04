import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { supabase } from '../../../integrations/supabase/client/supabaseClient'
import { cacheStoreName, getCachedStoreName } from '../../../shared/utils/storeNameCache'
import { useAuthStore } from '../model/useAuthStore'

const loginSchema = z.object({
  email: z.email('Correo invalido'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const signIn = useAuthStore((state) => state.signIn)
  const storeName = useAuthStore((state) => state.user?.storeName)
  const isLoading = useAuthStore((state) => state.isLoading)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const authError = useAuthStore((state) => state.error)
  const [publicStoreName, setPublicStoreName] = useState<string | null>(null)
  const displayStoreName = storeName ?? publicStoreName ?? getCachedStoreName() ?? 'POS Retail'

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    await signIn(values.email, values.password)
  })

  useEffect(() => {
    let isMounted = true

    async function loadPublicStoreName() {
      const { data, error } = await supabase
        .from('stores')
        .select('name')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<{ name: string }>()

      if (!isMounted || error) {
        return
      }

      const normalizedName = data?.name?.trim()
      if (normalizedName) {
        cacheStoreName(normalizedName)
        setPublicStoreName(normalizedName)
      }
    }

    void loadPublicStoreName()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-6 px-6 py-10 md:grid-cols-[1.2fr_1fr]">
      <section className="flex min-h-70 items-center justify-center rounded-3xl border border-zinc-800/70 bg-zinc-900/60 p-8 text-center backdrop-blur md:min-h-full md:p-10">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
            Sistema POS
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-zinc-100 md:text-5xl">
            {displayStoreName}
          </h1>
          <p className="mt-4 text-xl font-medium text-zinc-200 md:text-2xl">
            Cada venta cuenta, cada cliente vuelve
          </p>
          <p className="mt-4 text-zinc-300">
            Controla inventario, ventas y equipo desde un solo punto, con una experiencia rapida y clara.
          </p>
        </div>
      </section>

      <section className="flex min-h-70 items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6 md:min-h-full">
        <div className="w-full max-w-md">
          <h2 className="text-center text-2xl font-semibold text-zinc-100">Iniciar sesion</h2>
          <p className="mt-2 text-center text-sm text-zinc-400">
            Ingresa para continuar con tu jornada de ventas.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">Correo</span>
              <input
                type="email"
                autoComplete="email"
                {...register('email')}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none ring-0 transition focus:border-amber-400"
              />
              {errors.email ? (
                <span className="text-xs text-rose-400">{errors.email.message}</span>
              ) : null}
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">Contrasena</span>
              <input
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none ring-0 transition focus:border-amber-400"
              />
              {errors.password ? (
                <span className="text-xs text-rose-400">{errors.password.message}</span>
              ) : null}
            </label>

            {authError ? <p className="text-sm text-rose-400">{authError}</p> : null}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-zinc-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? 'Validando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
