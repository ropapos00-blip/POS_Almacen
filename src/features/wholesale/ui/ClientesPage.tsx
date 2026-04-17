import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../auth/model/useAuthStore'
import { CustomerForm } from './CustomerForm'
import {
	deactivateConfeccionCustomer,
	listConfeccionCustomerPurchaseStats,
	listConfeccionCustomers,
	updateConfeccionCustomer,
} from '../services/confeccionCustomerService'
import type { ConfeccionCustomer, CustomerPurchaseStats } from '../services/confeccionCustomerService'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateColombia } from '../../../shared/utils/dateTime'

export function ClientesPage() {
	const user = useAuthStore((state) => state.user)
	const [selectedCustomer, setSelectedCustomer] = useState<ConfeccionCustomer | null>(null)
	const [statsRows, setStatsRows] = useState<CustomerPurchaseStats[]>([])
	const [loadingStats, setLoadingStats] = useState(false)
	const [statsError, setStatsError] = useState<string | null>(null)
	const [editing, setEditing] = useState(false)
	const [savingEdit, setSavingEdit] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [feedback, setFeedback] = useState<string | null>(null)
	const [form, setForm] = useState({
		full_name: '',
		phone: '',
		address: '',
		document_id: '',
		city: '',
	})

	if (!user?.storeId) {
		return <p className="text-sm text-rose-300">No hay tienda activa para gestionar clientes.</p>
	}

	const storeId = user.storeId

	async function loadStats() {
		setLoadingStats(true)
		setStatsError(null)
		try {
			const rows = await listConfeccionCustomerPurchaseStats(storeId)
			setStatsRows(rows)
		} catch (err) {
			setStatsRows([])
			setStatsError(err instanceof Error ? err.message : 'No se pudo cargar el resumen de compras.')
		} finally {
			setLoadingStats(false)
		}
	}

	async function refreshSelectedCustomer(customerId: string) {
		const customers = await listConfeccionCustomers(storeId, { includeInactive: true, limit: 500 })
		const fresh = customers.find((item) => item.id === customerId) ?? null
		setSelectedCustomer(fresh)
		if (fresh) {
			setForm({
				full_name: fresh.full_name,
				phone: fresh.phone,
				address: fresh.address,
				document_id: fresh.document_id,
				city: fresh.city,
			})
		}
	}

	useEffect(() => {
		void loadStats()
	}, [storeId])

	const selectedCustomerStats = useMemo(() => {
		if (!selectedCustomer) {
			return null
		}

		const keyByNameAndPhone = `${selectedCustomer.full_name.trim().toLowerCase()}::${selectedCustomer.phone.trim()}`
		const keyByNameOnly = `${selectedCustomer.full_name.trim().toLowerCase()}::`

		return (
			statsRows.find((row) => row.key === keyByNameAndPhone) ??
			statsRows.find((row) => row.key === keyByNameOnly) ??
			null
		)
	}, [selectedCustomer, statsRows])

	function startEditCustomer() {
		if (!selectedCustomer) {
			return
		}
		setFeedback(null)
		setEditing(true)
		setForm({
			full_name: selectedCustomer.full_name,
			phone: selectedCustomer.phone,
			address: selectedCustomer.address,
			document_id: selectedCustomer.document_id,
			city: selectedCustomer.city,
		})
	}

	async function saveCustomerEdit() {
		if (!selectedCustomer) {
			return
		}

		setSavingEdit(true)
		setFeedback(null)
		try {
			const updated = await updateConfeccionCustomer(selectedCustomer.id, storeId, form)
			setSelectedCustomer(updated)
			setEditing(false)
			setFeedback('Cliente actualizado correctamente.')
			await loadStats()
		} catch (err) {
			setFeedback(err instanceof Error ? err.message : 'No se pudo actualizar el cliente.')
		} finally {
			setSavingEdit(false)
		}
	}

	async function handleDeactivateCustomer() {
		if (!selectedCustomer) {
			return
		}

		const confirmed = window.confirm(
			`¿Eliminar cliente ${selectedCustomer.full_name}? Se desactivará y no saldrá en búsquedas para facturar.`,
		)
		if (!confirmed) {
			return
		}

		setDeleting(true)
		setFeedback(null)
		try {
			await deactivateConfeccionCustomer(selectedCustomer.id, storeId)
			await refreshSelectedCustomer(selectedCustomer.id)
			setEditing(false)
			setFeedback('Cliente desactivado correctamente.')
		} catch (err) {
			setFeedback(err instanceof Error ? err.message : 'No se pudo eliminar el cliente.')
		} finally {
			setDeleting(false)
		}
	}

	return (
		<section className="space-y-4">
			<header>
				<h1 className="text-xl font-semibold text-zinc-100">Clientes Confección</h1>
				<p className="mt-1 text-sm text-zinc-400">
					Crea y consulta clientes aquí. Luego los buscas en Factura Confección para facturar pedidos.
				</p>
			</header>

			<article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
				<h2 className="text-base font-semibold text-zinc-100">Crear o buscar cliente</h2>
				<p className="mt-1 text-xs text-zinc-500">Usa nombre, cédula/NIT o teléfono para encontrar un cliente.</p>

				<div className="mt-4">
					<CustomerForm
						storeId={storeId}
						onSelect={(customer) => {
							setSelectedCustomer(customer)
							setEditing(false)
							setForm({
								full_name: customer.full_name,
								phone: customer.phone,
								address: customer.address,
								document_id: customer.document_id,
								city: customer.city,
							})
							void loadStats()
						}}
					/>
				</div>
			</article>

			{selectedCustomer ? (
				<article className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h3 className="text-sm font-semibold text-zinc-100">Cliente seleccionado</h3>
						<div className="flex gap-2">
							{editing ? (
								<>
									<button
										type="button"
										onClick={() => {
											setEditing(false)
											setFeedback(null)
										}}
										className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
									>
										Cancelar
									</button>
									<button
										type="button"
										onClick={() => {
											void saveCustomerEdit()
										}}
										disabled={savingEdit}
										className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-900 disabled:opacity-70"
									>
										{savingEdit ? 'Guardando...' : 'Guardar cambios'}
									</button>
								</>
							) : (
								<button
									type="button"
									onClick={startEditCustomer}
									className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200"
								>
									Editar
								</button>
							)}
							<button
								type="button"
								onClick={() => {
									void handleDeactivateCustomer()
								}}
								disabled={deleting || !selectedCustomer.is_active}
								className="rounded-lg border border-rose-500/40 px-3 py-1 text-xs text-rose-300 disabled:opacity-60"
							>
								{deleting ? 'Eliminando...' : selectedCustomer.is_active ? 'Eliminar' : 'Inactivo'}
							</button>
						</div>
					</div>

					{editing ? (
						<div className="mt-3 grid gap-2 md:grid-cols-2">
							<input
								value={form.full_name}
								onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
								placeholder="Nombre"
								className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
							/>
							<input
								value={form.phone}
								onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
								placeholder="Teléfono"
								className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
							/>
							<input
								value={form.address}
								onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
								placeholder="Dirección"
								className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
							/>
							<input
								value={form.document_id}
								onChange={(event) => setForm((prev) => ({ ...prev, document_id: event.target.value }))}
								placeholder="Documento"
								className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
							/>
							<input
								value={form.city}
								onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
								placeholder="Ciudad"
								className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
							/>
						</div>
					) : (
						<div className="mt-2 grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
							<p>Nombre: {selectedCustomer.full_name}</p>
							<p>Teléfono: {selectedCustomer.phone}</p>
							<p>Documento: {selectedCustomer.document_id}</p>
							<p>Ciudad: {selectedCustomer.city}</p>
							<p className="md:col-span-2">Dirección: {selectedCustomer.address}</p>
						</div>
					)}

					<div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
						<h4 className="text-xs uppercase tracking-[0.12em] text-zinc-500">Detalle de compras</h4>
						{selectedCustomerStats ? (
							<div className="mt-2 grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
								<p>Facturas: {selectedCustomerStats.invoicesCount}</p>
								<p>Total comprado: {formatCop(selectedCustomerStats.totalPurchased)}</p>
								<p>Pagado: {formatCop(selectedCustomerStats.totalPaid)}</p>
								<p>Pendiente: {formatCop(selectedCustomerStats.totalPending)}</p>
								<p>Ticket promedio: {formatCop(selectedCustomerStats.averageTicket)}</p>
								<p>
									Última compra:{' '}
									{selectedCustomerStats.lastPurchaseAt
										? formatDateColombia(selectedCustomerStats.lastPurchaseAt)
										: 'Sin compras'}
								</p>
							</div>
						) : (
							<p className="mt-2 text-xs text-zinc-500">No hay compras registradas para este cliente.</p>
						)}
					</div>

					{feedback ? <p className="mt-3 text-xs text-amber-300">{feedback}</p> : null}
				</article>
			) : null}

			<article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-base font-semibold text-zinc-100">Ranking de compras</h2>
					<button
						type="button"
						onClick={() => {
							void loadStats()
						}}
						className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
					>
						Actualizar
					</button>
				</div>
				<p className="mt-1 text-xs text-zinc-500">Ordenado de mayor a menor compra total.</p>

				{loadingStats ? <p className="mt-3 text-xs text-zinc-400">Cargando resumen...</p> : null}
				{statsError ? <p className="mt-3 text-xs text-rose-300">{statsError}</p> : null}

				{!loadingStats && !statsError ? (
					<div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
						<table className="min-w-full text-sm">
							<thead className="bg-zinc-900/90 text-xs uppercase tracking-[0.12em] text-zinc-500">
								<tr>
									<th className="px-3 py-2 text-left">Cliente</th>
									<th className="px-3 py-2 text-left">Facturas</th>
									<th className="px-3 py-2 text-left">Total</th>
									<th className="px-3 py-2 text-left">Pendiente</th>
									<th className="px-3 py-2 text-left">Última compra</th>
								</tr>
							</thead>
							<tbody>
								{statsRows.length === 0 ? (
									<tr>
										<td className="px-3 py-3 text-zinc-400" colSpan={5}>
											No hay compras registradas todavía.
										</td>
									</tr>
								) : (
									statsRows.map((row) => (
										<tr key={row.key} className="border-t border-zinc-800">
											<td className="px-3 py-2 text-zinc-200">
												<p>{row.customerName}</p>
												<p className="text-xs text-zinc-500">{row.customerPhone ?? 'Sin teléfono'}</p>
											</td>
											<td className="px-3 py-2 text-zinc-300">{row.invoicesCount}</td>
											<td className="px-3 py-2 text-zinc-200">{formatCop(row.totalPurchased)}</td>
											<td className="px-3 py-2 text-zinc-300">{formatCop(row.totalPending)}</td>
											<td className="px-3 py-2 text-zinc-400">
												{row.lastPurchaseAt ? formatDateColombia(row.lastPurchaseAt) : 'Sin compras'}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				) : null}
			</article>
		</section>
	)
}
