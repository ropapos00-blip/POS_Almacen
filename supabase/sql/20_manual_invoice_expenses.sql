-- 20_manual_invoice_expenses.sql
-- Gastos provisionales del modulo de factura manual por tienda.

create table if not exists public.manual_invoice_expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null,
  category text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists idx_manual_invoice_expenses_store_date
  on public.manual_invoice_expenses (store_id, expense_date desc, created_at desc);

alter table public.manual_invoice_expenses enable row level security;

drop policy if exists manual_invoice_expenses_read_policy on public.manual_invoice_expenses;
create policy manual_invoice_expenses_read_policy on public.manual_invoice_expenses
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists manual_invoice_expenses_write_policy on public.manual_invoice_expenses;
drop policy if exists manual_invoice_expenses_insert_policy on public.manual_invoice_expenses;
drop policy if exists manual_invoice_expenses_update_policy on public.manual_invoice_expenses;
drop policy if exists manual_invoice_expenses_delete_policy on public.manual_invoice_expenses;

create policy manual_invoice_expenses_insert_policy on public.manual_invoice_expenses
for insert
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  )
);

create policy manual_invoice_expenses_update_policy on public.manual_invoice_expenses
for update
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
)
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

create policy manual_invoice_expenses_delete_policy on public.manual_invoice_expenses
for delete
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);
