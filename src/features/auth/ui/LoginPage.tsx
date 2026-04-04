import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuthStore } from '../model/useAuthStore'

const loginSchema = z.object({
  email: z.email('Correo invalido'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const signIn = useAuthStore((state) => state.signIn)
  const isLoading = useAuthStore((state) => state.isLoading)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const authError = useAuthStore((state) => state.error)

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
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-6 px-6 py-10 md:grid-cols-[1.2fr_1fr]">
      <section className="rounded-3xl border border-zinc-800/70 bg-zinc-900/60 p-8 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-400">
          POS Retail
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-zinc-100">
          Acceso seguro para operacion de tienda
        </h1>
        <p className="mt-4 max-w-2xl text-zinc-300">
          Inicio de sesion con Supabase Auth. Los permisos reales se aplican por
          rol y tienda mediante RLS en PostgreSQL.
        </p>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6">
        <h2 className="text-xl font-semibold text-zinc-100">Iniciar sesion</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Usa las credenciales registradas en tu proyecto Supabase.
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
      </section>
    </main>
  )
}
