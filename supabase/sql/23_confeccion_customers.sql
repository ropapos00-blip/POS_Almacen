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
