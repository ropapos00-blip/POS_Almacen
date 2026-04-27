import { useState } from 'react'
import { createConfeccionCustomer, searchConfeccionCustomers } from '../services/confeccionCustomerService'
import type { ConfeccionCustomer } from '../services/confeccionCustomerService'

interface CustomerSelectorProps {
	storeId: string
	selectedName: string
	selectedPhone: string
	onSelect: (customer: ConfeccionCustomer) => void
	onClear: () => void
}

export function CustomerSelector({
	storeId,
	selectedName,
	selectedPhone,
	onSelect,
	onClear,
}: CustomerSelectorProps) {
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<ConfeccionCustomer[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [showCreateForm, setShowCreateForm] = useState(false)
	const [creating, setCreating] = useState(false)
	const [createError, setCreateError] = useState<string | null>(null)
	const [form, setForm] = useState({
		full_name: '',
		phone: '',
		address: '',
		document_id: '',
		city: '',
	})

	async function handleSearch(value: string) {
		setQuery(value)
		setError(null)
		setCreateError(null)

		if (value.trim().length < 2) {
			setResults([])
			setShowCreateForm(false)
			return
		}

		setLoading(true)
		try {
			const found = await searchConfeccionCustomers(storeId, value.trim())
			setResults(found)
		} catch (err) {
			setResults([])
			setError(err instanceof Error ? err.message : 'No se pudo buscar clientes.')
		} finally {
			setLoading(false)
		}
	}

	async function handleCreateCustomer(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setCreateError(null)

		if (!storeId) {
			setCreateError('No hay tienda activa para crear clientes.')
			return
		}

		setCreating(true)
		try {
			const created = await createConfeccionCustomer({
				store_id: storeId,
				full_name: form.full_name.trim(),
				phone: form.phone.trim(),
				address: form.address.trim(),
				document_id: form.document_id.trim(),
				city: form.city.trim(),
			})

			onSelect(created)
			setQuery(created.full_name)
			setResults([])
			setShowCreateForm(false)
			setCreateError(null)
			setForm({
				full_name: '',
				phone: '',
				address: '',
				document_id: '',
				city: '',
			})
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : 'No se pudo crear el cliente.')
		} finally {
			setCreating(false)
		}
	}

	const shouldSuggestCreate =
		query.trim().length >= 2 && !loading && results.length === 0 && !error && !selectedName.trim()

	return (
		<div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
			<p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Cliente para factura</p>

			<input
				value={query}
				onChange={(event) => {
					void handleSearch(event.target.value)
				}}
				placeholder="Buscar cliente por nombre, cédula o teléfono"
				className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
			/>

			{loading ? <p className="text-xs text-zinc-500">Buscando clientes...</p> : null}
			{error ? <p className="text-xs text-rose-300">{error}</p> : null}

			{results.length > 0 ? (
				<ul className="ghost-scrollbar max-h-52 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 pr-1">
					{results.map((customer) => (
						<li
							key={customer.id}
							onClick={() => {
								onSelect(customer)
								setQuery(customer.full_name)
								setResults([])
							}}
							className="cursor-pointer px-3 py-2 text-sm hover:bg-zinc-800"
						>
							<p className="font-medium text-zinc-100">{customer.full_name}</p>
							<p className="text-xs text-zinc-400">{customer.document_id} · {customer.phone}</p>
						</li>
					))}
				</ul>
			) : null}

			{shouldSuggestCreate && !showCreateForm ? (
				<div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
					<p className="text-xs text-zinc-400">No encontramos ese cliente. ¿Deseas crearlo ahora?</p>
					<button
						type="button"
						onClick={() => {
							setShowCreateForm(true)
							setForm((prev) => ({ ...prev, full_name: prev.full_name || query.trim() }))
						}}
						className="mt-2 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-900"
					>
						Ingresar nuevo cliente
					</button>
				</div>
			) : null}

			{showCreateForm ? (
				<form onSubmit={handleCreateCustomer} className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 md:grid-cols-2">
					<input
						required
						value={form.full_name}
						onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
						placeholder="Nombre"
						className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
					/>
					<input
						required
						value={form.phone}
						onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
						placeholder="Teléfono"
						className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
					/>
					<input
						required
						value={form.address}
						onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
						placeholder="Dirección"
						className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
					/>
					<input
						required
						value={form.document_id}
						onChange={(event) => setForm((prev) => ({ ...prev, document_id: event.target.value }))}
						placeholder="NIT o cédula"
						className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
					/>
					<input
						required
						value={form.city}
						onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
						placeholder="Ciudad"
						className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
					/>
					<div className="flex gap-2 md:col-span-2">
						<button
							type="submit"
							disabled={creating}
							className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
						>
							{creating ? 'Guardando...' : 'Crear cliente y seleccionar'}
						</button>
						<button
							type="button"
							onClick={() => {
								setShowCreateForm(false)
								setCreateError(null)
							}}
							className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
						>
							Cancelar
						</button>
					</div>
					{createError ? <p className="md:col-span-2 text-xs text-rose-300">{createError}</p> : null}
				</form>
			) : null}

			{selectedName.trim() ? (
				<div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2">
					<div>
						<p className="text-sm font-medium text-zinc-100">{selectedName}</p>
						<p className="text-xs text-zinc-400">{selectedPhone || 'Sin teléfono'}</p>
					</div>
					<button
						type="button"
						onClick={onClear}
						className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
					>
						Quitar
					</button>
				</div>
			) : (
				<p className="text-xs text-zinc-500">Selecciona un cliente existente antes de guardar la factura.</p>
			)}
		</div>
	)
}
