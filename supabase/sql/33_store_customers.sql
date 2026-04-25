-- 33_store_customers.sql
-- Tabla de clientes para tienda retail (POS / Factura manual)

create table if not exists public.store_customers (
  id           uuid        primary key default gen_random_uuid(),
  store_id     uuid        not null references public.stores(id) on delete restrict,
  full_name    text        not null,
  phone        text        not null default '',
  document_id  text        not null default '',
  address      text        not null default '',
  city         text        not null default '',
  notes        text        not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  is_active    boolean     not null default true
);

create index if not exists store_customers_store_idx on public.store_customers(store_id);

alter table public.store_customers enable row level security;

drop policy if exists store_customers_read on public.store_customers;
create policy store_customers_read on public.store_customers
  for select
  using (store_id in (select public.current_user_store_ids()));

drop policy if exists store_customers_write on public.store_customers;
create policy store_customers_write on public.store_customers
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
