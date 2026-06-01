-- 43_manual_invoice_returns_and_store_credit.sql
-- Devoluciones parciales para facturas manuales con:
-- 1) reintegro de inventario por variant_id
-- 2) saldo a favor del cliente (store credit)
-- 3) aplicacion atomica del saldo a favor al crear nuevas facturas manuales

-- ============================================================
-- 1. Esquema para devoluciones y saldo a favor
-- ============================================================
create table if not exists public.manual_invoice_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  manual_invoice_id uuid not null references public.manual_invoices(id) on delete restrict,
  return_number text not null,
  customer_name text,
  customer_phone text not null,
  reason text,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (store_id, return_number)
);

create index if not exists idx_manual_invoice_returns_store_created
  on public.manual_invoice_returns (store_id, created_at desc);

create index if not exists idx_manual_invoice_returns_invoice
  on public.manual_invoice_returns (manual_invoice_id);

create table if not exists public.manual_invoice_return_items (
  id uuid primary key default gen_random_uuid(),
  manual_invoice_return_id uuid not null references public.manual_invoice_returns(id) on delete cascade,
  manual_invoice_item_id uuid not null references public.manual_invoice_items(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index if not exists idx_manual_invoice_return_items_return
  on public.manual_invoice_return_items (manual_invoice_return_id);

create index if not exists idx_manual_invoice_return_items_item
  on public.manual_invoice_return_items (manual_invoice_item_id);

create table if not exists public.manual_invoice_customer_credits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_phone text not null,
  customer_name text,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, customer_phone)
);

create index if not exists idx_manual_invoice_customer_credits_store_phone
  on public.manual_invoice_customer_credits (store_id, customer_phone);

create table if not exists public.manual_invoice_credit_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_phone text not null,
  customer_name text,
  movement_type text not null check (movement_type in ('return', 'apply', 'adjustment')),
  amount numeric(12,2) not null check (amount <> 0),
  balance_after numeric(12,2) not null check (balance_after >= 0),
  reference_type text not null check (reference_type in ('manual_invoice_return', 'manual_invoice', 'manual_adjustment')),
  reference_id uuid,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_manual_invoice_credit_movements_store_created
  on public.manual_invoice_credit_movements (store_id, created_at desc);

create index if not exists idx_manual_invoice_credit_movements_phone
  on public.manual_invoice_credit_movements (store_id, customer_phone, created_at desc);

alter table public.manual_invoices
  add column if not exists credit_applied_total numeric(12,2) not null default 0 check (credit_applied_total >= 0);

-- ============================================================
-- 2. RLS para nuevas tablas
-- ============================================================
alter table public.manual_invoice_returns enable row level security;
alter table public.manual_invoice_return_items enable row level security;
alter table public.manual_invoice_customer_credits enable row level security;
alter table public.manual_invoice_credit_movements enable row level security;

drop policy if exists manual_invoice_returns_read_policy on public.manual_invoice_returns;
create policy manual_invoice_returns_read_policy on public.manual_invoice_returns
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists manual_invoice_returns_write_policy on public.manual_invoice_returns;
create policy manual_invoice_returns_write_policy on public.manual_invoice_returns
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

drop policy if exists manual_invoice_return_items_read_policy on public.manual_invoice_return_items;
create policy manual_invoice_return_items_read_policy on public.manual_invoice_return_items
for select
using (
  exists (
    select 1
    from public.manual_invoice_returns mir
    where mir.id = manual_invoice_return_items.manual_invoice_return_id
      and mir.store_id in (select public.current_user_store_ids())
  )
);

drop policy if exists manual_invoice_return_items_write_policy on public.manual_invoice_return_items;
create policy manual_invoice_return_items_write_policy on public.manual_invoice_return_items
for all
using (
  exists (
    select 1
    from public.manual_invoice_returns mir
    where mir.id = manual_invoice_return_items.manual_invoice_return_id
      and mir.store_id in (select public.current_user_store_ids())
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
    from public.manual_invoice_returns mir
    where mir.id = manual_invoice_return_items.manual_invoice_return_id
      and mir.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
        or public.current_user_has_role('cashier')
      )
  )
);

drop policy if exists manual_invoice_customer_credits_read_policy on public.manual_invoice_customer_credits;
create policy manual_invoice_customer_credits_read_policy on public.manual_invoice_customer_credits
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists manual_invoice_customer_credits_write_policy on public.manual_invoice_customer_credits;
create policy manual_invoice_customer_credits_write_policy on public.manual_invoice_customer_credits
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

drop policy if exists manual_invoice_credit_movements_read_policy on public.manual_invoice_credit_movements;
create policy manual_invoice_credit_movements_read_policy on public.manual_invoice_credit_movements
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists manual_invoice_credit_movements_write_policy on public.manual_invoice_credit_movements;
create policy manual_invoice_credit_movements_write_policy on public.manual_invoice_credit_movements
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

-- ============================================================
-- 3. Consulta de saldo a favor
-- ============================================================
drop function if exists public.get_manual_invoice_customer_credit_balance(uuid, text);

create or replace function public.get_manual_invoice_customer_credit_balance(
  p_store_id uuid,
  p_customer_phone text
)
returns table (balance numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_phone text;
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  v_phone := trim(coalesce(p_customer_phone, ''));

  if v_phone = '' then
    return query select 0::numeric;
    return;
  end if;

  return query
  select coalesce(micc.balance, 0)::numeric
  from public.manual_invoice_customer_credits micc
  where micc.store_id = p_store_id
    and micc.customer_phone = v_phone
  limit 1;

  if not found then
    return query select 0::numeric;
  end if;
end;
$$;

grant execute on function public.get_manual_invoice_customer_credit_balance(uuid, text) to authenticated;

-- ============================================================
-- 4. Devolucion parcial con reintegro de inventario + credito
-- ============================================================
drop function if exists public.create_manual_invoice_return_transaction(uuid, uuid, jsonb, text);

create or replace function public.create_manual_invoice_return_transaction(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_return_items jsonb,
  p_reason text default null
)
returns table (
  return_id uuid,
  return_number text,
  credit_amount numeric,
  returned_customer_phone text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.manual_invoices%rowtype;
  v_return_id uuid;
  v_return_number text;
  v_reason text;
  v_total numeric := 0;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_sold_item record;
  v_already_returned integer;
  v_line_total numeric;
  v_phone text;
  v_customer_name text;
  v_next_number integer;
  v_balance_after numeric;
begin
  select *
  into v_invoice
  from public.manual_invoices
  where id = p_invoice_id
    and is_active = true;

  if not found then
    raise exception 'Factura manual no encontrada o anulada.';
  end if;

  if not (v_invoice.store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda de esta factura.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  ) then
    raise exception 'Usuario sin permisos para devolver facturas manuales.';
  end if;

  v_phone := trim(coalesce(v_invoice.customer_phone, ''));
  if v_phone = '' then
    raise exception 'La factura no tiene telefono de cliente. No se puede crear saldo a favor.';
  end if;

  if jsonb_typeof(p_return_items) <> 'array' or jsonb_array_length(p_return_items) = 0 then
    raise exception 'Debes enviar al menos un item a devolver.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  v_customer_name := nullif(trim(coalesce(v_invoice.customer_name, '')), '');

  perform pg_advisory_xact_lock(hashtext('manual_invoice_return:' || p_invoice_id::text));
  perform pg_advisory_xact_lock(hashtext('manual_invoice_return_number:' || v_invoice.store_id::text));

  for v_item in select * from jsonb_array_elements(p_return_items)
  loop
    v_item_id := nullif(trim(coalesce(v_item->>'manual_invoice_item_id', '')), '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    if v_item_id is null then
      raise exception 'manual_invoice_item_id es obligatorio para cada item devuelto.';
    end if;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en devolucion.';
    end if;

    select mi.id, mi.manual_invoice_id, mi.variant_id, mi.description, mi.quantity, mi.unit_price
    into v_sold_item
    from public.manual_invoice_items mi
    where mi.id = v_item_id
      and mi.manual_invoice_id = p_invoice_id;

    if not found then
      raise exception 'Item de factura invalido para esta devolucion.';
    end if;

    select coalesce(sum(miri.quantity), 0)::integer
    into v_already_returned
    from public.manual_invoice_return_items miri
    join public.manual_invoice_returns mir on mir.id = miri.manual_invoice_return_id
    where mir.manual_invoice_id = p_invoice_id
      and miri.manual_invoice_item_id = v_item_id;

    if v_qty > (v_sold_item.quantity - v_already_returned) then
      raise exception 'La cantidad a devolver supera el pendiente de ese item.';
    end if;

    v_line_total := v_qty * v_sold_item.unit_price;
    v_total := v_total + v_line_total;
  end loop;

  if v_total <= 0 then
    raise exception 'La devolucion debe tener un valor mayor a cero.';
  end if;

  select mir.return_number
  into v_return_number
  from public.manual_invoice_returns mir
  where mir.store_id = v_invoice.store_id
    and mir.return_number ~ '^DEV-[0-9]+$'
  order by length(mir.return_number) desc, mir.return_number desc
  limit 1;

  if v_return_number is not null then
    v_next_number := (regexp_replace(v_return_number, '[^0-9]', '', 'g'))::integer + 1;
  else
    v_next_number := 1;
  end if;

  if v_next_number < 10000 then
    v_return_number := 'DEV-' || lpad(v_next_number::text, 4, '0');
  else
    v_return_number := 'DEV-' || v_next_number::text;
  end if;

  insert into public.manual_invoice_returns (
    store_id,
    manual_invoice_id,
    return_number,
    customer_name,
    customer_phone,
    reason,
    total_amount,
    created_by
  )
  values (
    v_invoice.store_id,
    p_invoice_id,
    v_return_number,
    v_customer_name,
    v_phone,
    v_reason,
    v_total,
    p_actor_user_id
  )
  returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_return_items)
  loop
    v_item_id := nullif(trim(coalesce(v_item->>'manual_invoice_item_id', '')), '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    select mi.id, mi.manual_invoice_id, mi.variant_id, mi.description, mi.quantity, mi.unit_price
    into v_sold_item
    from public.manual_invoice_items mi
    where mi.id = v_item_id
      and mi.manual_invoice_id = p_invoice_id;

    v_line_total := v_qty * v_sold_item.unit_price;

    insert into public.manual_invoice_return_items (
      manual_invoice_return_id,
      manual_invoice_item_id,
      variant_id,
      description,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_return_id,
      v_sold_item.id,
      v_sold_item.variant_id,
      v_sold_item.description,
      v_qty,
      v_sold_item.unit_price,
      v_line_total
    );

    if v_sold_item.variant_id is not null then
      update public.inventory_stock
      set quantity_on_hand = quantity_on_hand + v_qty
      where store_id = v_invoice.store_id
        and variant_id = v_sold_item.variant_id;

      insert into public.inventory_movements (
        store_id,
        variant_id,
        type,
        quantity,
        reason,
        reference_type,
        reference_id,
        performed_by
      )
      values (
        v_invoice.store_id,
        v_sold_item.variant_id,
        'return',
        v_qty,
        'manual_invoice_return',
        'manual_invoice_return',
        v_return_id,
        p_actor_user_id
      );
    end if;
  end loop;

  insert into public.manual_invoice_customer_credits (
    store_id,
    customer_phone,
    customer_name,
    balance,
    updated_at
  )
  values (
    v_invoice.store_id,
    v_phone,
    v_customer_name,
    v_total,
    now()
  )
  on conflict (store_id, customer_phone)
  do update
  set
    customer_name = coalesce(excluded.customer_name, public.manual_invoice_customer_credits.customer_name),
    balance = public.manual_invoice_customer_credits.balance + excluded.balance,
    updated_at = now()
  returning balance into v_balance_after;

  insert into public.manual_invoice_credit_movements (
    store_id,
    customer_phone,
    customer_name,
    movement_type,
    amount,
    balance_after,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  values (
    v_invoice.store_id,
    v_phone,
    v_customer_name,
    'return',
    v_total,
    v_balance_after,
    'manual_invoice_return',
    v_return_id,
    v_reason,
    p_actor_user_id
  );

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    v_invoice.store_id,
    p_actor_user_id,
    'manual_invoice_return_created',
    'manual_invoice_returns',
    v_return_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'return_number', v_return_number,
      'credit_amount', v_total,
      'customer_phone', v_phone,
      'reason', v_reason
    )
  );

  return query
  select v_return_id, v_return_number, v_total, v_phone;
end;
$$;

grant execute on function public.create_manual_invoice_return_transaction(uuid, uuid, jsonb, text) to authenticated;

-- ============================================================
-- 5. Actualizar create_manual_invoice_transaction para aplicar saldo
-- ============================================================
drop function if exists public.create_manual_invoice_transaction(uuid, uuid, text, numeric, text, text, jsonb);
drop function if exists public.create_manual_invoice_transaction(uuid, uuid, text, numeric, text, text, jsonb, text);
drop function if exists public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text);
drop function if exists public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text, numeric);

create or replace function public.create_manual_invoice_transaction(
  p_store_id uuid,
  p_created_by uuid,
  p_customer_name text,
  p_customer_phone text,
  p_discount_total numeric,
  p_payment_method text,
  p_payment_reference text,
  p_items jsonb,
  p_notes text default null,
  p_apply_credit numeric default 0
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
  v_amount_due numeric := 0;
  v_credit_to_apply numeric := greatest(0, coalesce(p_apply_credit, 0));
  v_credit_balance numeric := 0;
  v_credit_balance_after numeric := 0;
  v_item jsonb;
  v_description text;
  v_qty integer;
  v_price numeric;
  v_line_total numeric;
  v_mixed_parts text[];
  v_mixed_sum numeric;
  v_variant_id uuid;
  v_stock integer;
  v_phone text;
  v_name text;
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  ) then
    raise exception 'Usuario sin permisos para facturacion manual.';
  end if;

  if p_payment_method not in (
    'cash', 'addi', 'credilondon', 'dataphone',
    'bancolombia', 'daviplata', 'nequi', 'rapirecarga', 'mixed'
  ) then
    raise exception 'Metodo de pago invalido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura manual requiere al menos un item.';
  end if;

  -- First pass: validate items, check stock, compute subtotal
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

    -- Check stock for inventory-linked items
    v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;
    if v_variant_id is not null then
      select quantity_on_hand into v_stock
      from public.inventory_stock
      where variant_id = v_variant_id and store_id = p_store_id;

      if not found then
        raise exception 'Producto no encontrado en el inventario de la tienda.';
      end if;

      if v_stock < v_qty then
        raise exception 'Stock insuficiente: disponible %, solicitado %.', v_stock, v_qty;
      end if;
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
  v_phone := trim(coalesce(p_customer_phone, ''));
  v_name := nullif(trim(coalesce(p_customer_name, '')), '');

  if v_credit_to_apply > 0 then
    if v_phone = '' then
      raise exception 'No puedes aplicar saldo a favor sin telefono del cliente.';
    end if;

    select coalesce(micc.balance, 0)
    into v_credit_balance
    from public.manual_invoice_customer_credits micc
    where micc.store_id = p_store_id
      and micc.customer_phone = v_phone
    for update;

    if not found then
      v_credit_balance := 0;
    end if;

    if v_credit_to_apply > v_credit_balance then
      raise exception 'El saldo a favor disponible (% ) es menor al saldo a aplicar (%).', v_credit_balance, v_credit_to_apply;
    end if;

    if v_credit_to_apply > v_grand_total then
      raise exception 'El saldo a aplicar no puede superar el total de la factura.';
    end if;
  end if;

  v_amount_due := v_grand_total - v_credit_to_apply;

  -- Validate mixed payment: sum of both amounts must equal amount due
  if p_payment_method = 'mixed' then
    v_mixed_parts := string_to_array(coalesce(p_payment_reference, ''), ':');
    if array_length(v_mixed_parts, 1) = 4 then
      v_mixed_sum := coalesce(v_mixed_parts[2]::numeric, 0) + coalesce(v_mixed_parts[4]::numeric, 0);
      if abs(v_mixed_sum - v_amount_due) > 1 then
        raise exception 'Los montos del pago mixto (%) no coinciden con el total a pagar (%).', v_mixed_sum, v_amount_due;
      end if;
    end if;
  end if;

  -- Bloqueo exclusivo por tienda para evitar colisiones concurrentes
  perform pg_advisory_xact_lock(hashtext('manual_invoice:' || p_store_id::text));

  -- Generar numero de factura
  select mi.invoice_number into v_invoice_number
  from public.manual_invoices mi
  where mi.store_id = p_store_id
    and mi.invoice_number ~ '^No Venta [0-9]+$'
  order by length(mi.invoice_number) desc, mi.invoice_number desc
  limit 1;

  declare
    v_next_number integer;
  begin
    if v_invoice_number is not null then
      v_next_number := (regexp_replace(v_invoice_number, '[^0-9]', '', 'g'))::integer + 1;
    else
      v_next_number := 1;
    end if;
    if v_next_number < 10000 then
      v_invoice_number := 'No Venta ' || lpad(v_next_number::text, 4, '0');
    else
      v_invoice_number := 'No Venta ' || v_next_number::text;
    end if;
  end;

  insert into public.manual_invoices (
    store_id,
    invoice_number,
    customer_name,
    customer_phone,
    notes,
    subtotal,
    discount_total,
    credit_applied_total,
    grand_total,
    payment_method,
    payment_reference,
    created_by,
    source
  )
  values (
    p_store_id,
    v_invoice_number,
    v_name,
    nullif(v_phone, ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_subtotal,
    v_discount_total,
    v_credit_to_apply,
    v_grand_total,
    p_payment_method,
    nullif(trim(coalesce(p_payment_reference, '')), ''),
    p_created_by,
    'provisional'
  )
  returning id into v_invoice_id;

  -- Second pass: insert items and deduct inventory when variant_id is present
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_line_total := v_qty * v_price;
    v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;

    insert into public.manual_invoice_items (
      manual_invoice_id,
      description,
      quantity,
      unit_price,
      line_total,
      variant_id
    )
    values (
      v_invoice_id,
      v_description,
      v_qty,
      v_price,
      v_line_total,
      v_variant_id
    );

    -- Deduct inventory for linked variants
    if v_variant_id is not null then
      update public.inventory_stock
      set quantity_on_hand = quantity_on_hand - v_qty
      where variant_id = v_variant_id and store_id = p_store_id;
    end if;
  end loop;

  if v_credit_to_apply > 0 then
    update public.manual_invoice_customer_credits micc
    set
      balance = micc.balance - v_credit_to_apply,
      customer_name = coalesce(v_name, micc.customer_name),
      updated_at = now()
    where micc.store_id = p_store_id
      and micc.customer_phone = v_phone
    returning balance into v_credit_balance_after;

    insert into public.manual_invoice_credit_movements (
      store_id,
      customer_phone,
      customer_name,
      movement_type,
      amount,
      balance_after,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      p_store_id,
      v_phone,
      v_name,
      'apply',
      -v_credit_to_apply,
      v_credit_balance_after,
      'manual_invoice',
      v_invoice_id,
      'Aplicacion de saldo a favor',
      p_created_by
    );
  end if;

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
    'manual_invoice_created',
    'manual_invoices',
    v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'grand_total', v_grand_total,
      'credit_applied_total', v_credit_to_apply,
      'amount_due', v_amount_due
    )
  );

  return query select v_invoice_id, v_invoice_number;
end;
$$;

grant execute on function public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text, numeric) to authenticated;
