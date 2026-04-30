-- 39_cash_register_sessions.sql
-- Sesiones de caja diarias (cierre de caja).
-- El admin abre la sesion con una base en efectivo.
-- El cajero (o admin) cierra la sesion al final del dia
-- registrando el efectivo fisico contado.
--
-- MIGRACION SEGURA: compatible con tablas ya creadas sin session_date.

-- Paso 1: crear la tabla con solo el PK si no existe en absoluto
-- Todas las demas columnas se agregan en el paso 2 con ADD COLUMN IF NOT EXISTS
create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid()
);

-- Paso 2: agregar columnas que podrian faltar si la tabla existia previamente
alter table public.cash_register_sessions
  add column if not exists created_at timestamptz not null default now();

alter table public.cash_register_sessions
  add column if not exists session_date date;

alter table public.cash_register_sessions
  add column if not exists cash_base numeric(12,2) not null default 0;

alter table public.cash_register_sessions
  add column if not exists cash_counted numeric(12,2);

alter table public.cash_register_sessions
  add column if not exists closed_at timestamptz;

alter table public.cash_register_sessions
  add column if not exists notes_open text;

alter table public.cash_register_sessions
  add column if not exists notes_close text;

alter table public.cash_register_sessions
  add column if not exists status text not null default 'open';

alter table public.cash_register_sessions
  add column if not exists opened_by uuid references public.profiles(id) on delete restrict;

alter table public.cash_register_sessions
  add column if not exists closed_by uuid references public.profiles(id) on delete restrict;

alter table public.cash_register_sessions
  add column if not exists store_id uuid references public.stores(id) on delete restrict;

-- Paso 3: backfill session_date con la fecha de creacion donde sea NULL
update public.cash_register_sessions
  set session_date = coalesce(created_at, now())::date
  where session_date is null;

-- Paso 4: aplicar NOT NULL ahora que no hay NULLs
alter table public.cash_register_sessions
  alter column session_date set not null;

-- Paso 5: checks de validacion (ignorar si ya existen)
do $$ begin
  alter table public.cash_register_sessions
    add constraint cash_register_sessions_cash_base_check check (cash_base >= 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.cash_register_sessions
    add constraint cash_register_sessions_cash_counted_check check (cash_counted >= 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.cash_register_sessions
    add constraint cash_register_sessions_status_check check (status in ('open', 'closed'));
exception when duplicate_object then null;
end $$;

-- Paso 6: unique (store_id, session_date) si no existe
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name   = 'cash_register_sessions'
      and constraint_name = 'cash_register_sessions_store_id_session_date_key'
  ) then
    alter table public.cash_register_sessions
      add constraint cash_register_sessions_store_id_session_date_key
      unique (store_id, session_date);
  end if;
end $$;

-- Paso 7: indice
create index if not exists idx_cash_register_sessions_store_date
  on public.cash_register_sessions (store_id, session_date desc);

-- Paso 8: RLS
alter table public.cash_register_sessions enable row level security;

-- Lectura: cualquier usuario con acceso a la tienda
drop policy if exists cash_register_sessions_read_policy on public.cash_register_sessions;
create policy cash_register_sessions_read_policy on public.cash_register_sessions
for select
using (store_id in (select public.current_user_store_ids()));

-- Insert: solo admin / super_admin
drop policy if exists cash_register_sessions_insert_policy on public.cash_register_sessions;
create policy cash_register_sessions_insert_policy on public.cash_register_sessions
for insert
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

-- Update: admin/super_admin pueden modificar todo; cajero puede cerrar
drop policy if exists cash_register_sessions_update_policy on public.cash_register_sessions;
create policy cash_register_sessions_update_policy on public.cash_register_sessions
for update
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
