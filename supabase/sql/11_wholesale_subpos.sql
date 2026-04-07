-- 11_wholesale_subpos.sql
-- Sub POS de mayoreo para confeccion/cartera, separado del POS retail.
-- Incluye soporte de credito, estado de cartera e impresion carta.

create table if not exists public.wholesale_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  invoice_number text not null,
  customer_name text,
  customer_phone text,
  notes text,
  issued_at timestamptz not null default now(),
  due_date date,
  subtotal numeric(12,2) not null,
  discount_total numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null,
  paid_total numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null,
  is_credit boolean not null default false,
  status text not null check (status in ('issued', 'partial', 'paid', 'overdue', 'void')),
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer', 'mixed', 'credit')),
  payment_reference text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  is_active boolean not null default true,
  unique (store_id, invoice_number)
);

create table if not exists public.wholesale_invoice_items (
  id uuid primary key default gen_random_uuid(),
  wholesale_invoice_id uuid not null references public.wholesale_invoices(id) on delete cascade,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null
);

create table if not exists public.wholesale_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  wholesale_invoice_id uuid not null references public.wholesale_invoices(id) on delete cascade,
  paid_at timestamptz not null default now(),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer', 'mixed')),
  payment_reference text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_wholesale_invoices_store_issued on public.wholesale_invoices (store_id, issued_at desc);
create index if not exists idx_wholesale_invoices_store_status on public.wholesale_invoices (store_id, status);
create index if not exists idx_wholesale_items_invoice on public.wholesale_invoice_items (wholesale_invoice_id);
create index if not exists idx_wholesale_payments_invoice_paid on public.wholesale_payments (wholesale_invoice_id, paid_at desc);

alter table public.wholesale_invoices enable row level security;
alter table public.wholesale_invoice_items enable row level security;
alter table public.wholesale_payments enable row level security;

drop policy if exists wholesale_invoices_read_policy on public.wholesale_invoices;
create policy wholesale_invoices_read_policy on public.wholesale_invoices
for select
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

drop policy if exists wholesale_invoices_write_policy on public.wholesale_invoices;
create policy wholesale_invoices_write_policy on public.wholesale_invoices
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

drop policy if exists wholesale_invoice_items_read_policy on public.wholesale_invoice_items;
create policy wholesale_invoice_items_read_policy on public.wholesale_invoice_items
for select
using (
  exists (
    select 1
    from public.wholesale_invoices wi
    where wi.id = wholesale_invoice_items.wholesale_invoice_id
      and wi.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
      )
  )
);

drop policy if exists wholesale_invoice_items_write_policy on public.wholesale_invoice_items;
create policy wholesale_invoice_items_write_policy on public.wholesale_invoice_items
for all
using (
  exists (
    select 1
    from public.wholesale_invoices wi
    where wi.id = wholesale_invoice_items.wholesale_invoice_id
      and wi.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
      )
  )
)
with check (
  exists (
    select 1
    from public.wholesale_invoices wi
    where wi.id = wholesale_invoice_items.wholesale_invoice_id
      and wi.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
      )
  )
);

drop policy if exists wholesale_payments_read_policy on public.wholesale_payments;
create policy wholesale_payments_read_policy on public.wholesale_payments
for select
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

drop policy if exists wholesale_payments_write_policy on public.wholesale_payments;
create policy wholesale_payments_write_policy on public.wholesale_payments
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

drop function if exists public.sync_wholesale_invoice_status();
create or replace function public.sync_wholesale_invoice_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'void' then
    return new;
  end if;

  new.paid_total := greatest(coalesce(new.paid_total, 0), 0);
  new.grand_total := greatest(coalesce(new.grand_total, 0), 0);
  new.balance_due := greatest(new.grand_total - new.paid_total, 0);

  if new.balance_due = 0 then
    new.status := 'paid';
  elsif new.paid_total > 0 then
    if new.is_credit and new.due_date is not null and new.due_date < current_date then
      new.status := 'overdue';
    else
      new.status := 'partial';
    end if;
  else
    if new.is_credit and new.due_date is not null and new.due_date < current_date then
      new.status := 'overdue';
    else
      new.status := 'issued';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_wholesale_invoice_status on public.wholesale_invoices;
create trigger trg_sync_wholesale_invoice_status
before insert or update of grand_total, paid_total, balance_due, is_credit, due_date, status
on public.wholesale_invoices
for each row
execute function public.sync_wholesale_invoice_status();

drop function if exists public.sync_wholesale_overdue_by_store(uuid);
create or replace function public.sync_wholesale_overdue_by_store(p_store_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin y super_admin pueden sincronizar cartera de mayoreo.';
  end if;

  update public.wholesale_invoices
  set status = case
    when status = 'void' then 'void'
    when balance_due = 0 then 'paid'
    when is_credit and due_date is not null and due_date < current_date then 'overdue'
    when paid_total > 0 then 'partial'
    else 'issued'
  end
  where store_id = p_store_id;
end;
$$;

grant execute on function public.sync_wholesale_overdue_by_store(uuid) to authenticated;

drop function if exists public.create_wholesale_invoice_transaction(uuid, uuid, text, text, numeric, boolean, date, text, text, text, jsonb);

create or replace function public.create_wholesale_invoice_transaction(
  p_store_id uuid,
  p_created_by uuid,
  p_customer_name text,
  p_customer_phone text,
  p_discount_total numeric,
  p_is_credit boolean,
  p_due_date date,
  p_payment_method text,
  p_payment_reference text,
  p_notes text,
  p_items jsonb
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 0;
  v_discount_total numeric := coalesce(p_discount_total, 0);
  v_grand_total numeric := 0;
  v_paid_total numeric := 0;
  v_balance_due numeric := 0;
  v_status text := 'issued';
  v_item jsonb;
  v_description text;
  v_qty integer;
  v_price numeric;
  v_line_total numeric;
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin y super_admin pueden crear facturas de mayoreo.';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'mixed', 'credit') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if p_is_credit and p_due_date is null then
    raise exception 'Factura a credito requiere fecha de vencimiento.';
  end if;

  if not p_is_credit and p_payment_method = 'credit' then
    raise exception 'Metodo credit solo permitido cuando es factura a credito.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura de mayoreo requiere al menos un item.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);

    if v_description = '' then
      raise exception 'Descripcion de item requerida.';
    end if;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en items.';
    end if;

    if v_price < 0 then
      raise exception 'Precio invalido en items.';
    end if;

    v_line_total := v_qty * v_price;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  if v_discount_total < 0 then
    raise exception 'Descuento invalido.';
  end if;

  if v_discount_total > v_subtotal then
    raise exception 'Descuento no puede superar subtotal.';
  end if;

  v_grand_total := v_subtotal - v_discount_total;

  if p_is_credit then
    v_paid_total := 0;
    v_balance_due := v_grand_total;
    v_status := 'issued';
  else
    v_paid_total := v_grand_total;
    v_balance_due := 0;
    v_status := 'paid';
  end if;

  v_invoice_number := concat('WM-', to_char(now(), 'YYYYMMDD-HH24MISS'), '-', floor(random() * 9000 + 1000)::int);

  insert into public.wholesale_invoices (
    store_id,
    invoice_number,
    customer_name,
    customer_phone,
    notes,
    issued_at,
    due_date,
    subtotal,
    discount_total,
    grand_total,
    paid_total,
    balance_due,
    is_credit,
    status,
    payment_method,
    payment_reference,
    created_by
  )
  values (
    p_store_id,
    v_invoice_number,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    now(),
    p_due_date,
    v_subtotal,
    v_discount_total,
    v_grand_total,
    v_paid_total,
    v_balance_due,
    p_is_credit,
    v_status,
    p_payment_method,
    nullif(trim(coalesce(p_payment_reference, '')), ''),
    p_created_by
  )
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_line_total := v_qty * v_price;

    insert into public.wholesale_invoice_items (
      wholesale_invoice_id,
      description,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_invoice_id,
      v_description,
      v_qty,
      v_price,
      v_line_total
    );
  end loop;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    p_store_id,
    p_created_by,
    'wholesale_invoice_created',
    'wholesale_invoices',
    v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'grand_total', v_grand_total,
      'is_credit', p_is_credit,
      'due_date', p_due_date,
      'balance_due', v_balance_due
    )
  );

  return query select v_invoice_id, v_invoice_number;
end;
$$;

grant execute on function public.create_wholesale_invoice_transaction(uuid, uuid, text, text, numeric, boolean, date, text, text, text, jsonb) to authenticated;

drop function if exists public.register_wholesale_payment(uuid, uuid, numeric, text, text, text);
create or replace function public.register_wholesale_payment(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text,
  p_notes text
)
returns table (invoice_id uuid, paid_total numeric, balance_due numeric, status text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_store_id uuid;
  v_current_paid numeric;
  v_grand_total numeric;
  v_status text;
  v_new_paid numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor a cero.';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'mixed') then
    raise exception 'Metodo de abono invalido.';
  end if;

  select store_id, paid_total, grand_total, status
  into v_store_id, v_current_paid, v_grand_total, v_status
  from public.wholesale_invoices
  where id = p_invoice_id
  for update;

  if v_store_id is null then
    raise exception 'Factura de mayoreo no encontrada.';
  end if;

  if not (v_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin y super_admin pueden registrar abonos.';
  end if;

  if v_status = 'void' then
    raise exception 'No se puede abonar una factura anulada.';
  end if;

  if v_status = 'paid' then
    raise exception 'La factura ya esta totalmente pagada.';
  end if;

  if (v_current_paid + p_amount) > v_grand_total then
    raise exception 'El abono supera el saldo pendiente de la factura.';
  end if;

  v_new_paid := v_current_paid + p_amount;

  insert into public.wholesale_payments (
    store_id,
    wholesale_invoice_id,
    amount,
    payment_method,
    payment_reference,
    notes,
    created_by
  )
  values (
    v_store_id,
    p_invoice_id,
    p_amount,
    p_payment_method,
    nullif(trim(coalesce(p_payment_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_actor_user_id
  );

  update public.wholesale_invoices
  set paid_total = v_new_paid
  where id = p_invoice_id;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    v_store_id,
    p_actor_user_id,
    'wholesale_payment_registered',
    'wholesale_invoices',
    p_invoice_id,
    jsonb_build_object(
      'amount', p_amount,
      'payment_method', p_payment_method
    )
  );

  return query
  select id, paid_total, balance_due, status
  from public.wholesale_invoices
  where id = p_invoice_id;
end;
$$;

grant execute on function public.register_wholesale_payment(uuid, uuid, numeric, text, text, text) to authenticated;