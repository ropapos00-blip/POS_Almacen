-- Tabla de clientes para módulo Confección
create table if not exists public.confeccion_customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  full_name text not null,
  phone text not null,
  address text not null,
  document_id text not null,
  city text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  unique (store_id, document_id)
);

alter table public.confeccion_customers enable row level security;

drop policy if exists confeccion_customers_read_policy on public.confeccion_customers;
create policy confeccion_customers_read_policy on public.confeccion_customers
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists confeccion_customers_write_policy on public.confeccion_customers;
create policy confeccion_customers_write_policy on public.confeccion_customers
for all
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  )
)
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  )
);
