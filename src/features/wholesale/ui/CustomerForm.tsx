import { useState } from 'react';
import { searchConfeccionCustomers, createConfeccionCustomer } from '../services/confeccionCustomerService';
import type { ConfeccionCustomer } from '../services/confeccionCustomerService';

interface CustomerFormProps {
  storeId: string;
  onSelect: (customer: ConfeccionCustomer) => void;
}

export function CustomerForm({ storeId, onSelect }: CustomerFormProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConfeccionCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    address: '',
    document_id: '',
    city: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    if (e.target.value.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const found = await searchConfeccionCustomers(storeId, e.target.value);
      setResults(found);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const customer = await createConfeccionCustomer({
        store_id: storeId,
        ...form,
      });
      onSelect(customer);
      setForm({ full_name: '', phone: '', address: '', document_id: '', city: '' });
      setQuery('');
      setResults([]);
    } catch (err: any) {
      setError(err.message || 'Error al crear cliente');
    }
    setCreating(false);
  }

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={handleSearch}
        placeholder="Buscar cliente por nombre, cédula o teléfono"
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
      />
      {loading && <div className="text-xs text-zinc-400">Buscando...</div>}
      {results.length > 0 && (
        <ul className="ghost-scrollbar border border-zinc-800 rounded-lg bg-zinc-900 max-h-60 overflow-y-auto">
          {results.map((customer) => (
            <li
              key={customer.id}
              className="px-3 py-2 hover:bg-zinc-800 cursor-pointer text-sm"
              onClick={() => onSelect(customer)}
            >
              <span className="font-medium text-zinc-100">{customer.full_name}</span>
              <span className="ml-2 text-xs text-zinc-400">{customer.document_id} · {customer.phone}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleCreate} className="grid gap-2 md:grid-cols-2">
        <input
          required
          value={form.full_name}
          onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
          placeholder="Nombre"
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        />
        <input
          required
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          placeholder="Teléfono"
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        />
        <input
          required
          value={form.address}
          onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
          placeholder="Dirección"
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        />
        <input
          required
          value={form.document_id}
          onChange={e => setForm(f => ({ ...f, document_id: e.target.value }))}
          placeholder="NIT o cédula"
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        />
        <input
          required
          value={form.city}
          onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
          placeholder="Ciudad"
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm md:col-span-2"
        />
        <button
          type="submit"
          disabled={creating}
          className="md:col-span-2 rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-70"
        >
          {creating ? 'Guardando...' : 'Crear nuevo cliente'}
        </button>
        {error && <div className="md:col-span-2 text-xs text-rose-400">{error}</div>}
      </form>
    </div>
  );
}
