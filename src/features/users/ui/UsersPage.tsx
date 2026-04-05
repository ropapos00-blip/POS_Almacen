import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  useCreateUserMutation,
  useDeactivateUserMutation,
  useReactivateUserMutation,
  useUpdateStoreReceiptProfileMutation,
  useUpdateStoreNameMutation,
  useUpdateUserRoleMutation,
  useUsersQuery,
} from '../model/useUsersQueries'
import type { CreateUserInput } from '../model/users.types'

const createUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Nombre requerido'),
  email: z.email('Email invalido'),
  phone: z
    .string()
    .trim()
    .min(7, 'Telefono invalido')
    .max(20, 'Telefono demasiado largo')
    .regex(/^[+0-9\s()-]+$/, 'Telefono invalido'),
  password: z.string().min(6, 'Minimo 6 caracteres'),
  roleCode: z.enum(['admin', 'cashier']),
})

function roleBadge(roleCode: string) {
  if (roleCode === 'super_admin') return 'bg-sky-500/20 text-sky-300 border-sky-500/30'
  if (roleCode === 'admin') return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
}

export function UsersPage() {
  const user = useAuthStore((state) => state.user)
  const setStoreName = useAuthStore((state) => state.setStoreName)
  const setStoreSlogan = useAuthStore((state) => state.setStoreSlogan)
  const setStoreLoginSupportText = useAuthStore((state) => state.setStoreLoginSupportText)
  const setStoreReceipt = useAuthStore((state) => state.setStoreReceipt)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [storeNameInput, setStoreNameInput] = useState('')
  const [modalMessage, setModalMessage] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [editingRoleByAssignment, setEditingRoleByAssignment] = useState<Record<string, 'admin' | 'cashier'>>({})
  const [confirmAction, setConfirmAction] = useState<
    | {
        type: 'deactivate' | 'reactivate'
        assignmentId: string
        fullName: string
      }
    | null
  >(null)

  const usersQuery = useUsersQuery(user?.storeId, user?.role)
  const createMutation = useCreateUserMutation(user?.storeId)
  const updateRoleMutation = useUpdateUserRoleMutation(user?.storeId)
  const deactivateMutation = useDeactivateUserMutation(user?.storeId)
  const reactivateMutation = useReactivateUserMutation(user?.storeId)
  const updateStoreNameMutation = useUpdateStoreNameMutation(user?.storeId)
  const updateStoreReceiptProfileMutation = useUpdateStoreReceiptProfileMutation(user?.storeId)
  const [receiptProfileInput, setReceiptProfileInput] = useState({
    loginSlogan: '',
    loginSupportText: '',
    legalName: '',
    taxId: '',
    taxRegime: '',
    address: '',
    city: '',
    phone: '',
  })

  useEffect(() => {
    setStoreNameInput(user?.storeName ?? '')
  }, [user?.storeName])

  useEffect(() => {
    setReceiptProfileInput({
      loginSlogan: user?.storeSlogan ?? '',
      loginSupportText: user?.storeLoginSupportText ?? '',
      legalName: user?.storeReceipt.legalName ?? '',
      taxId: user?.storeReceipt.taxId ?? '',
      taxRegime: user?.storeReceipt.taxRegime ?? '',
      address: user?.storeReceipt.address ?? '',
      city: user?.storeReceipt.city ?? '',
      phone: user?.storeReceipt.phone ?? '',
    })
  }, [
    user?.storeSlogan,
    user?.storeLoginSupportText,
    user?.storeReceipt.address,
    user?.storeReceipt.city,
    user?.storeReceipt.legalName,
    user?.storeReceipt.phone,
    user?.storeReceipt.taxId,
    user?.storeReceipt.taxRegime,
  ])

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      roleCode: user?.role === 'admin' ? 'cashier' : 'admin',
    },
  })

  const roleOptions = useMemo(() => {
    if (user?.role === 'super_admin') {
      return [
        { value: 'admin' as const, label: 'Admin' },
        { value: 'cashier' as const, label: 'Cajero' },
      ]
    }
    return [{ value: 'cashier' as const, label: 'Cajero' }]
  }, [user?.role])

  const onSubmit = form.handleSubmit(async (values) => {
    setFeedback(null)
    try {
      await createMutation.mutateAsync(values)
      setFeedback(`Usuario ${values.email} creado correctamente.`)
      form.reset({
        fullName: '',
        email: '',
        phone: '',
        password: '',
        roleCode: user?.role === 'admin' ? 'cashier' : 'admin',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el usuario.'
      setFeedback(message)
      setModalMessage(message)
    }
  })

  const canManageRow = (rowRoleCode: string, rowUserId: string) => {
    if (!user) return false
    if (rowUserId === user.id) return false
    if (rowRoleCode === 'super_admin') return false
    if (user.role === 'super_admin') return true
    if (user.role === 'admin') return rowRoleCode === 'cashier'
    return false
  }

  const filteredUsers = useMemo(() => {
    const rows = usersQuery.data ?? []
    if (statusFilter === 'all') return rows
    if (statusFilter === 'active') return rows.filter((row) => row.isActive)
    return rows.filter((row) => !row.isActive)
  }, [statusFilter, usersQuery.data])

  const getEditableRole = (assignmentId: string, rowRoleCode: 'admin' | 'cashier' | 'super_admin') => {
    const current = editingRoleByAssignment[assignmentId]
    if (current) return current
    if (rowRoleCode === 'admin') return 'admin'
    return 'cashier'
  }

  const updateRole = async (assignmentId: string, roleCode: 'admin' | 'cashier') => {
    setFeedback(null)
    try {
      await updateRoleMutation.mutateAsync({ assignmentId, roleCode })
      setFeedback('Rol actualizado correctamente.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el rol.'
      setFeedback(message)
      setModalMessage(message)
    }
  }

  const deactivateUser = async (assignmentId: string) => {
    setFeedback(null)
    try {
      await deactivateMutation.mutateAsync({ assignmentId })
      setFeedback('Usuario desactivado correctamente.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo desactivar el usuario.'
      setFeedback(message)
      setModalMessage(message)
    }
  }

  const reactivateUser = async (assignmentId: string) => {
    setFeedback(null)
    try {
      await reactivateMutation.mutateAsync({ assignmentId })
      setFeedback('Usuario reactivado correctamente.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo reactivar el usuario.'
      setFeedback(message)
      setModalMessage(message)
    }
  }

  const confirmMutationAction = async () => {
    if (!confirmAction) return

    if (confirmAction.type === 'deactivate') {
      await deactivateUser(confirmAction.assignmentId)
    } else {
      await reactivateUser(confirmAction.assignmentId)
    }

    setConfirmAction(null)
  }

  const saveStoreName = async () => {
    if (!user?.storeId || user.role !== 'super_admin') {
      return
    }

    setFeedback(null)
    try {
      const updatedName = await updateStoreNameMutation.mutateAsync(storeNameInput)
      setStoreName(updatedName)
      setStoreNameInput(updatedName)
      setFeedback(`Nombre del almacen actualizado a: ${updatedName}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el nombre del almacen.'
      setFeedback(message)
      setModalMessage(message)
    }
  }

  const saveReceiptProfile = async () => {
    if (!user?.storeId || user.role !== 'super_admin') {
      return
    }

    setFeedback(null)
    try {
      const updated = await updateStoreReceiptProfileMutation.mutateAsync(receiptProfileInput)
      setReceiptProfileInput(updated)
      setStoreSlogan(updated.loginSlogan || 'Cada venta cuenta, cada cliente vuelve')
      setStoreLoginSupportText(
        updated.loginSupportText ||
          'Controla inventario, ventas y equipo desde un solo punto, con una experiencia rapida y clara.',
      )
      setStoreReceipt(updated)
      setFeedback('Datos de factura/comanda actualizados correctamente.')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron actualizar los datos de factura/comanda.'
      setFeedback(message)
      setModalMessage(message)
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Gestion de usuarios</h1>
        <p className="mt-2 text-zinc-400">
          Super Admin crea admins/cajeros. Admin crea cajeros.
        </p>
        {feedback ? <p className="mt-2 text-sm text-amber-300">{feedback}</p> : null}
      </header>

      {user?.role === 'super_admin' ? (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Configuracion de almacen y factura</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Super admin define los datos que salen en factura/comanda.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={storeNameInput}
              onChange={(event) => setStoreNameInput(event.target.value)}
              placeholder="Nombre del almacen"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                void saveStoreName()
              }}
              disabled={updateStoreNameMutation.isPending}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {updateStoreNameMutation.isPending ? 'Guardando...' : 'Guardar nombre'}
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <textarea
              value={receiptProfileInput.loginSlogan}
              onChange={(event) =>
                setReceiptProfileInput((prev) => ({ ...prev, loginSlogan: event.target.value }))
              }
              placeholder="Eslogan del login (debajo del logo)"
              rows={2}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm md:col-span-2"
            />
            <textarea
              value={receiptProfileInput.loginSupportText}
              onChange={(event) =>
                setReceiptProfileInput((prev) => ({ ...prev, loginSupportText: event.target.value }))
              }
              placeholder="Texto descriptivo del login (parrafo inferior)"
              rows={2}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              value={receiptProfileInput.legalName}
              onChange={(event) =>
                setReceiptProfileInput((prev) => ({ ...prev, legalName: event.target.value }))
              }
              placeholder="Empresa / razon social"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              value={receiptProfileInput.taxId}
              onChange={(event) =>
                setReceiptProfileInput((prev) => ({ ...prev, taxId: event.target.value }))
              }
              placeholder="NIT"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              value={receiptProfileInput.taxRegime}
              onChange={(event) =>
                setReceiptProfileInput((prev) => ({ ...prev, taxRegime: event.target.value }))
              }
              placeholder="Regimen fiscal (ej. No responsable de IVA)"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              value={receiptProfileInput.phone}
              onChange={(event) =>
                setReceiptProfileInput((prev) => ({ ...prev, phone: event.target.value }))
              }
              placeholder="Telefono de la tienda"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              value={receiptProfileInput.address}
              onChange={(event) =>
                setReceiptProfileInput((prev) => ({ ...prev, address: event.target.value }))
              }
              placeholder="Direccion"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              value={receiptProfileInput.city}
              onChange={(event) =>
                setReceiptProfileInput((prev) => ({ ...prev, city: event.target.value }))
              }
              placeholder="Ciudad"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              void saveReceiptProfile()
            }}
            disabled={updateStoreReceiptProfileMutation.isPending}
            className="mt-3 rounded-lg border border-amber-500/50 px-4 py-2 text-sm font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {updateStoreReceiptProfileMutation.isPending
              ? 'Guardando datos de factura...'
              : 'Guardar datos de factura/comanda'}
          </button>
        </article>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Crear usuario</h2>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <input
              placeholder="Nombre completo"
              {...form.register('fullName')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              placeholder="Email"
              type="email"
              {...form.register('email')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              placeholder="Telefono"
              type="tel"
              {...form.register('phone')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              placeholder="Password"
              type="password"
              {...form.register('password')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <select
              {...form.register('roleCode')}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {createMutation.isPending ? 'Creando...' : 'Crear usuario'}
            </button>
          </form>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-100">Usuarios por tienda</h2>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>

          <ul className="mt-4 space-y-2">
            {filteredUsers.map((row) => (
              <li
                key={row.assignmentId}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{row.fullName}</p>
                    <p className="text-xs text-zinc-500">{row.email}</p>
                    {row.phone ? <p className="text-xs text-zinc-500">Tel: {row.phone}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs ${
                        row.isActive
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                          : 'border-zinc-600 bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {row.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-xs ${roleBadge(row.roleCode)}`}>
                      {row.roleName}
                    </span>
                  </div>
                </div>

                {canManageRow(row.roleCode, row.userId) ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={getEditableRole(row.assignmentId, row.roleCode)}
                      onChange={(event) => {
                        const value = event.target.value as 'admin' | 'cashier'
                        setEditingRoleByAssignment((prev) => ({
                          ...prev,
                          [row.assignmentId]: value,
                        }))
                      }}
                      disabled={updateRoleMutation.isPending || !row.isActive}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                    >
                      {user?.role === 'super_admin' ? <option value="admin">Admin</option> : null}
                      <option value="cashier">Cajero</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        void updateRole(row.assignmentId, getEditableRole(row.assignmentId, row.roleCode))
                      }
                      disabled={updateRoleMutation.isPending || !row.isActive}
                      className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-300 disabled:opacity-70"
                    >
                      Guardar rol
                    </button>

                    {row.isActive ? (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            type: 'deactivate',
                            assignmentId: row.assignmentId,
                            fullName: row.fullName,
                          })
                        }
                        disabled={deactivateMutation.isPending}
                        className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs text-rose-300 disabled:opacity-70"
                      >
                        Eliminar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            type: 'reactivate',
                            assignmentId: row.assignmentId,
                            fullName: row.fullName,
                          })
                        }
                        disabled={reactivateMutation.isPending}
                        className="rounded-lg border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 disabled:opacity-70"
                      >
                        Reactivar
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      </div>

      {modalMessage ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Aviso</h3>
            <p className="mt-2 text-sm text-zinc-300">{modalMessage}</p>
            <button
              type="button"
              onClick={() => setModalMessage(null)}
              className="mt-4 w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Confirmar accion</h3>
            <p className="mt-2 text-sm text-zinc-300">
              {confirmAction.type === 'deactivate'
                ? `Vas a desactivar a ${confirmAction.fullName}.`
                : `Vas a reactivar a ${confirmAction.fullName}.`}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmMutationAction()}
                className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
