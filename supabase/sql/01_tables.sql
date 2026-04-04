-- 01_tables.sql
-- Crear estructuras base del POS retail (sin policies)

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  timezone text not null default 'America/Lima',
  currency text not null default 'COP',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_store_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (user_id, store_id, role_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, slug)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  description text,
  brand text,
  gender text,
  season text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null,
  color text not null,
  sku text not null,
  barcode text not null,
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, sku),
  unique (store_id, barcode),
  unique (product_id, size, color)
);

create table if not exists public.inventory_stock (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity_on_hand integer not null default 0,
  quantity_reserved integer not null default 0,
  reorder_level integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (store_id, variant_id)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  type text not null check (type in ('in', 'out', 'adjustment', 'sale', 'return')),
  quantity integer not null,
  reason text,
  reference_type text,
  reference_id uuid,
  performed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_amount numeric(12,2) not null default 0,
  closed_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz,
  closing_amount numeric(12,2),
  status text not null default 'open' check (status in ('open', 'closed'))
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  register_session_id uuid references public.cash_register_sessions(id) on delete set null,
  sale_number text not null,
  customer_name text,
  subtotal numeric(12,2) not null,
  discount_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'void')),
  sold_by uuid not null references public.profiles(id) on delete restrict,
  sold_at timestamptz not null default now(),
  unique (store_id, sale_number)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  sku_snapshot text not null,
  name_snapshot text not null,
  size_snapshot text not null,
  color_snapshot text not null,
  unit_price numeric(12,2) not null,
  quantity integer not null,
  discount_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('cash', 'card', 'transfer', 'mixed')),
  amount numeric(12,2) not null,
  reference text,
  paid_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload_before jsonb,
  payload_after jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_store on public.categories (store_id);
create index if not exists idx_products_store on public.products (store_id);
create index if not exists idx_variants_store on public.product_variants (store_id);
create index if not exists idx_variants_barcode on public.product_variants (barcode);
create index if not exists idx_inventory_stock_store on public.inventory_stock (store_id);
create index if not exists idx_inventory_movements_store_created on public.inventory_movements (store_id, created_at desc);
create index if not exists idx_sales_store_sold_at on public.sales (store_id, sold_at desc);
create index if not exists idx_audit_logs_store_created on public.audit_logs (store_id, created_at desc);

create or replace function public.current_user_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select usr.store_id
  from public.user_store_roles usr
  where usr.user_id = auth.uid()
    and usr.is_active = true;
$$;

create or replace function public.current_user_has_role(role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_store_roles usr
    join public.roles r on r.id = usr.role_id
    where usr.user_id = auth.uid()
      and usr.is_active = true
      and r.code = role_code
  );
$$;
