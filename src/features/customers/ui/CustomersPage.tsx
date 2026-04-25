import { useState } from 'react'
import { useAuthStore } from '../../auth/model/useAuthStore'
import {
  createStoreCustomer,
  deactivateStoreCustomer,
  listStoreCustomers,
  searchStoreCustomers,
  updateStoreCustomer,
} from '../services/customersService'
import type { StoreCustomer } from '../services/customersService'

const emptyForm = { full_name: '', phone: '' }
type FormState = typeof emptyForm

export function CustomersPage() {
  const user = useAuthStore((s) => s.user)
  const storeId = user?.storeId ?? ''

  // List
  const [customers, setCustomers] = useState<StoreCustomer[]>([])
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [loading, setLoading] = useState(false)

  // Search
  const [searchTerm, setSearchTerm] = useState('')

  // New customer form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // Edit
  const [editTarget, setEditTarget] = useState<StoreCustomer | null>(null)
  const [editForm, setEditForm] = useState<FormState>(emptyForm)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editFeedback, setEditFeedback] = useState<string | null>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<StoreCustomer | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Include inactive toggle
  const [includeInactive, setIncludeInactive] = useState(false)

  async function loadCustomers() {
    if (!storeId) return
    setLoading(true)
    try {
      const rows = await listStoreCustomers(storeId, { includeInactive, limit: 500 })
      setCustomers(rows)
      setLoadedOnce(true)
    } catch (e) {
      setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Error al cargar clientes.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch() {
    if (!storeId) return
    if (!searchTerm.trim()) {
      await loadCustomers()
      return
    }
    setLoading(true)
    try {
      const rows = await searchStoreCustomers(storeId, searchTerm.trim())
      setCustomers(rows)
      setLoadedOnce(true)
    } catch (e) {
      setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Error al buscar.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!storeId) return
    if (!form.full_name.trim()) { setFeedback({ type: 'err', msg: 'El nombre es obligatorio.' }); return }
    setSaving(true)
    setFeedback(null)
    try {
      const created = await createStoreCustomer({
        store_id: storeId,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
      })
      setCustomers((prev) => [created, ...prev])
      setForm(emptyForm)
      setShowForm(false)
      setFeedback({ type: 'ok', msg: `Cliente "${created.full_name}" creado.` })
    } catch (e) {
      setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Error al crear cliente.' })
    } finally {
      setSaving(false)
    }
  }

  function startEdit(c: StoreCustomer) {
    setEditTarget(c)
    setEditForm({ full_name: c.full_name, phone: c.phone })
    setEditFeedback(null)
  }

  async function handleSaveEdit() {
    if (!editTarget || !storeId) return
    if (!editForm.full_name.trim()) { setEditFeedback('El nombre es obligatorio.'); return }
    setSavingEdit(true)
    setEditFeedback(null)
    try {
      const updated = await updateStoreCustomer(editTarget.id, storeId, {
        full_name: editForm.full_name.trim(),
        phone: editForm.phone.trim(),
      })
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setEditTarget(null)
    } catch (e) {
      setEditFeedback(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDeactivate() {
    if (!deleteTarget || !storeId) return
    setDeleting(true)
    try {
      await deactivateStoreCustomer(deleteTarget.id, storeId)
      setCustomers((prev) => prev.map((c) => c.id === deleteTarget.id ? { ...c, is_active: false } : c))
      setDeleteTarget(null)
    } catch (e) {
      setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Error al desactivar.' })
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const displayed = includeInactive ? customers : customers.filter((c) => c.is_active)

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-zinc-100">Clientes</h1>
        <p className="mt-1 text-sm text-zinc-400">Registro de clientes de la tienda.</p>
      </header>

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre, documento o teléfono…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }}
          className="flex-1 min-w-50 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          className="rounded-xl bg-zinc-700 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-600"
        >
          Buscar
        </button>
        {!loadedOnce && (
          <button
            type="button"
            onClick={() => void loadCustomers()}
            disabled={loading}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? 'Cargando…' : 'Ver todos'}
          </button>
        )}
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => { setIncludeInactive(e.target.checked); void loadCustomers() }}
            className="accent-amber-400"
          />
          Mostrar inactivos
        </label>
        <button
          type="button"
          onClick={() => { setShowForm(true); setFeedback(null) }}
          className="ml-auto rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300"
        >
          + Nuevo cliente
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <p className={`rounded-xl px-4 py-2 text-sm ${feedback.type === 'ok' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
          {feedback.msg}
        </p>
      )}

      {/* Customer list */}
      {loadedOnce && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/80">
          {displayed.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">No hay clientes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((c) => (
                  <tr key={c.id} className={`border-b border-zinc-800/60 last:border-0 ${!c.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-zinc-100">{c.full_name}</td>
                    <td className="px-4 py-2 text-zinc-400">{c.phone || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700/60 text-zinc-500'}`}>
                        {c.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="rounded border border-sky-500/40 px-2 py-1 text-xs text-sky-300 hover:bg-sky-400/10"
                        >
                          Editar
                        </button>
                        {c.is_active && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10"
                          >
                            Desactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Nuevo cliente</h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">✕</button>
            </div>

            {feedback?.type === 'err' && (
              <p className="mb-3 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-300">{feedback.msg}</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-400">Nombre *</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Nombre completo"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-400">Teléfono</label>
                <input type="text" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="300 123 4567"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none" />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" disabled={saving} onClick={() => void handleCreate()}
                className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50">
                {saving ? 'Guardando…' : 'Crear cliente'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="ml-auto rounded-xl border border-zinc-700 px-5 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-100">Editar cliente</h2>
              <button type="button" onClick={() => setEditTarget(null)} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">✕</button>
            </div>

            {editFeedback && (
              <p className="mb-3 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-300">{editFeedback}</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-400">Nombre *</label>
                <input type="text" value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-400">Teléfono</label>
                <input type="text" inputMode="tel" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none" />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" disabled={savingEdit} onClick={() => void handleSaveEdit()}
                className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50">
                {savingEdit ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button type="button" onClick={() => setEditTarget(null)}
                className="ml-auto rounded-xl border border-zinc-700 px-5 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-zinc-100">¿Desactivar cliente?</h2>
            <p className="mt-2 text-sm text-zinc-400">
              <span className="font-medium text-zinc-200">{deleteTarget.full_name}</span> quedará inactivo.
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={deleting} onClick={() => void handleDeactivate()}
                className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-50">
                {deleting ? 'Desactivando…' : 'Sí, desactivar'}
              </button>
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="ml-auto rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
