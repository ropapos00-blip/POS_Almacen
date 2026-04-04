-- 03_rls_policies.sql
-- Habilitar RLS y crear policies idempotentes

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.cash_register_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists categories_read_policy on public.categories;
create policy categories_read_policy on public.categories
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists categories_write_policy on public.categories;
create policy categories_write_policy on public.categories
for all
using (
  store_id in (select public.current_user_store_ids())
  and (public.current_user_has_role('super_admin') or public.current_user_has_role('admin'))
)
with check (
  store_id in (select public.current_user_store_ids())
  and (public.current_user_has_role('super_admin') or public.current_user_has_role('admin'))
);

drop policy if exists products_read_policy on public.products;
create policy products_read_policy on public.products
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists products_write_policy on public.products;
create policy products_write_policy on public.products
for all
using (
  store_id in (select public.current_user_store_ids())
  and (public.current_user_has_role('super_admin') or public.current_user_has_role('admin'))
)
with check (
  store_id in (select public.current_user_store_ids())
  and (public.current_user_has_role('super_admin') or public.current_user_has_role('admin'))
);

drop policy if exists variants_read_policy on public.product_variants;
create policy variants_read_policy on public.product_variants
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists variants_write_policy on public.product_variants;
create policy variants_write_policy on public.product_variants
for all
using (
  store_id in (select public.current_user_store_ids())
  and (public.current_user_has_role('super_admin') or public.current_user_has_role('admin'))
)
with check (
  store_id in (select public.current_user_store_ids())
  and (public.current_user_has_role('super_admin') or public.current_user_has_role('admin'))
);

drop policy if exists inventory_stock_read_policy on public.inventory_stock;
create policy inventory_stock_read_policy on public.inventory_stock
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists inventory_stock_write_policy on public.inventory_stock;
create policy inventory_stock_write_policy on public.inventory_stock
for all
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

drop policy if exists inventory_movements_read_policy on public.inventory_movements;
create policy inventory_movements_read_policy on public.inventory_movements
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists inventory_movements_write_policy on public.inventory_movements;
create policy inventory_movements_write_policy on public.inventory_movements
for insert
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

drop policy if exists cash_sessions_read_policy on public.cash_register_sessions;
create policy cash_sessions_read_policy on public.cash_register_sessions
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists cash_sessions_write_policy on public.cash_register_sessions;
create policy cash_sessions_write_policy on public.cash_register_sessions
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

drop policy if exists sales_read_policy on public.sales;
create policy sales_read_policy on public.sales
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists sales_write_policy on public.sales;
create policy sales_write_policy on public.sales
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

drop policy if exists sale_items_read_policy on public.sale_items;
create policy sale_items_read_policy on public.sale_items
for select
using (
  exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and s.store_id in (select public.current_user_store_ids())
  )
);

drop policy if exists sale_items_write_policy on public.sale_items;
create policy sale_items_write_policy on public.sale_items
for all
using (
  exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and s.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
        or public.current_user_has_role('cashier')
      )
  )
)
with check (
  exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and s.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
        or public.current_user_has_role('cashier')
      )
  )
);

drop policy if exists sale_payments_read_policy on public.sale_payments;
create policy sale_payments_read_policy on public.sale_payments
for select
using (
  exists (
    select 1
    from public.sales s
    where s.id = sale_payments.sale_id
      and s.store_id in (select public.current_user_store_ids())
  )
);

drop policy if exists sale_payments_write_policy on public.sale_payments;
create policy sale_payments_write_policy on public.sale_payments
for all
using (
  exists (
    select 1
    from public.sales s
    where s.id = sale_payments.sale_id
      and s.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
        or public.current_user_has_role('cashier')
      )
  )
)
with check (
  exists (
    select 1
    from public.sales s
    where s.id = sale_payments.sale_id
      and s.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
        or public.current_user_has_role('cashier')
      )
  )
);

drop policy if exists audit_logs_read_policy on public.audit_logs;
create policy audit_logs_read_policy on public.audit_logs
for select
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

drop policy if exists audit_logs_write_policy on public.audit_logs;
create policy audit_logs_write_policy on public.audit_logs
for insert
with check (store_id in (select public.current_user_store_ids()));
