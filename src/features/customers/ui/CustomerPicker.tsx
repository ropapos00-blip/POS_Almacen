import { useEffect, useRef, useState } from 'react'
import { createStoreCustomer, searchStoreCustomers } from '../services/customersService'
import type { StoreCustomer } from '../services/customersService'

interface CustomerPickerProps {
  storeId: string
  name: string
  phone: string
  onSelect: (name: string, phone: string) => void
}

export function CustomerPicker({ storeId, name, phone, onSelect }: CustomerPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StoreCustomer[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  async function runSearch(term: string) {
    if (!storeId || term.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const rows = await searchStoreCustomers(storeId, term.trim(), 8)
      setResults(rows)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  function handleQueryChange(val: string) {
    setQuery(val)
    setShowDropdown(true)
    setShowCreate(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void runSearch(val), 300)
  }

  function selectCustomer(c: StoreCustomer) {
    onSelect(c.full_name, c.phone)
    setQuery('')
    setResults([])
    setShowDropdown(false)
    setShowCreate(false)
  }

  function clearSelection() {
    onSelect('', '')
    setQuery('')
    setResults([])
    setShowCreate(false)
    setShowDropdown(false)
  }

  function openCreateForm() {
    setShowCreate(true)
    setShowDropdown(false)
    setNewName(query)
    setNewPhone('')
    setCreateErr(null)
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateErr('El nombre es obligatorio.')
      return
    }
    setCreating(true)
    setCreateErr(null)
    try {
      const created = await createStoreCustomer({
        store_id: storeId,
        full_name: newName.trim(),
        phone: newPhone.trim(),
      })
      onSelect(created.full_name, created.phone)
      setShowCreate(false)
      setNewName('')
      setNewPhone('')
      setQuery('')
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Error al crear cliente.')
    } finally {
      setCreating(false)
    }
  }

  // ── Selected state ──────────────────────────────────────────────
  if (name) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-amber-200">{name}</p>
          {phone && <p className="text-xs text-zinc-400">{phone}</p>}
        </div>
        <button
          type="button"
          onClick={clearSelection}
          className="shrink-0 text-lg leading-none text-zinc-400 hover:text-zinc-100"
          aria-label="Quitar cliente"
        >
          ×
        </button>
      </div>
    )
  }

  // ── Search + dropdown ───────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => {
          if (query.length >= 2) setShowDropdown(true)
        }}
        placeholder="Buscar cliente por nombre o teléfono…"
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
      />

      {showDropdown && query.length >= 2 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {searching && (
            <p className="px-4 py-2 text-xs text-zinc-500">Buscando…</p>
          )}
          {!searching && results.length === 0 && (
            <p className="px-4 py-2 text-xs text-zinc-500">Sin resultados para «{query}»</p>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectCustomer(c)}
              className="flex w-full flex-col px-4 py-2 text-left hover:bg-zinc-800"
            >
              <span className="text-sm text-zinc-100">{c.full_name}</span>
              {c.phone && <span className="text-xs text-zinc-500">{c.phone}</span>}
            </button>
          ))}
          <div className="border-t border-zinc-800 px-4 py-2">
            <button
              type="button"
              onClick={openCreateForm}
              className="text-xs text-amber-400 hover:underline"
            >
              + Crear nuevo cliente
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="mt-2 space-y-2 rounded-xl border border-zinc-700 bg-zinc-900/90 p-3">
          <p className="text-xs font-semibold text-zinc-300">Nuevo cliente</p>
          {createErr && (
            <p className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-300">{createErr}</p>
          )}
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre *"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
          />
          <input
            type="text"
            inputMode="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Teléfono"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreate()}
              className="rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50"
            >
              {creating ? 'Guardando…' : 'Crear y seleccionar'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
