-- 12_wholesale_inventory_credit_automation.sql
-- Script consolidado (reemplaza 12/13/14):
-- - Confeccion solo a credito con vencimiento automatico a 30 dias
-- - Inventario de confeccion separado del retail
-- - Catalogo propio de referencias (referencia, cantidad, valor unitario)

create table if not exists public.wholesale_references (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  reference text not null,
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, reference)
);

create table if not exists public.wholesale_reference_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  wholesale_reference_id uuid not null references public.wholesale_references(id) on delete restrict,
  type text not null check (type in ('in', 'out', 'adjustment')),
  quantity integer not null check (quantity > 0),
  reason text,
  reference_type text,
  reference_id uuid,
  performed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_wholesale_references_store on public.wholesale_references (store_id, reference);
create index if not exists idx_wholesale_reference_movements_store_created on public.wholesale_reference_movements (store_id, created_at desc);

alter table public.wholesale_invoice_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete restrict;

alter table public.wholesale_invoice_items
  add column if not exists reference text;

alter table public.wholesale_invoice_items
  add column if not exists wholesale_reference_id uuid references public.wholesale_references(id) on delete restrict;

create index if not exists idx_wholesale_items_variant on public.wholesale_invoice_items (variant_id);
create index if not exists idx_wholesale_items_reference_id on public.wholesale_invoice_items (wholesale_reference_id);

alter table public.wholesale_references enable row level security;
alter table public.wholesale_reference_movements enable row level security;

drop policy if exists wholesale_references_read_policy on public.wholesale_references;
create policy wholesale_references_read_policy on public.wholesale_references
for select
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

drop policy if exists wholesale_references_write_policy on public.wholesale_references;
create policy wholesale_references_write_policy on public.wholesale_references
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

drop policy if exists wholesale_reference_movements_read_policy on public.wholesale_reference_movements;
create policy wholesale_reference_movements_read_policy on public.wholesale_reference_movements
for select
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

drop policy if exists wholesale_reference_movements_write_policy on public.wholesale_reference_movements;
create policy wholesale_reference_movements_write_policy on public.wholesale_reference_movements
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

update public.wholesale_invoice_items
set reference = coalesce(reference, description)
where reference is null;

alter table public.wholesale_invoice_items
  alter column reference set not null;

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
  v_due_date date;
  v_item jsonb;
  v_reference_id uuid;
  v_qty integer;
  v_line_total numeric;
  v_ref record;
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin y super_admin pueden crear facturas de confeccion.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura de confeccion requiere al menos un item.';
  end if;

  if not p_is_credit then
    raise exception 'Confeccion solo permite venta a credito.';
  end if;

  if p_payment_method <> 'credit' then
    raise exception 'Confeccion usa metodo de pago credit al crear la factura.';
  end if;

  v_due_date := coalesce(p_due_date, current_date + 30);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_reference_id := coalesce(
      nullif(v_item->>'reference_id', '')::uuid,
      nullif(v_item->>'variant_id', '')::uuid
    );
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    if v_reference_id is null then
      raise exception 'Cada item debe incluir reference_id.';
    end if;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en items.';
    end if;

    select id, store_id, reference, unit_price, quantity_on_hand
    into v_ref
    from public.wholesale_references
    where id = v_reference_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Referencia de confeccion no encontrada o inactiva.';
    end if;

    if v_ref.store_id <> p_store_id then
      raise exception 'Referencia fuera de la tienda activa.';
    end if;

    if v_ref.quantity_on_hand < v_qty then
      raise exception 'Stock de confeccion insuficiente para la referencia %.', v_ref.reference;
    end if;

    v_line_total := v_qty * coalesce(v_ref.unit_price, 0);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  if v_discount_total < 0 then
    raise exception 'Descuento invalido.';
  end if;

  if v_discount_total > v_subtotal then
    raise exception 'Descuento no puede superar subtotal.';
  end if;

  v_grand_total := v_subtotal - v_discount_total;
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
    v_due_date,
    v_subtotal,
    v_discount_total,
    v_grand_total,
    0,
    v_grand_total,
    true,
    'issued',
    'credit',
    nullif(trim(coalesce(p_payment_reference, '')), ''),
    p_created_by
  )
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_reference_id := coalesce(
      nullif(v_item->>'reference_id', '')::uuid,
      nullif(v_item->>'variant_id', '')::uuid
    );
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    select id, reference, unit_price
    into v_ref
    from public.wholesale_references
    where id = v_reference_id;

    v_line_total := v_qty * coalesce(v_ref.unit_price, 0);

    insert into public.wholesale_invoice_items (
      wholesale_invoice_id,
      wholesale_reference_id,
      reference,
      description,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_invoice_id,
      v_reference_id,
      v_ref.reference,
      v_ref.reference,
      v_qty,
      coalesce(v_ref.unit_price, 0),
      v_line_total
    );

    update public.wholesale_references
    set quantity_on_hand = quantity_on_hand - v_qty,
        updated_at = now()
    where id = v_reference_id;

    insert into public.wholesale_reference_movements (
      store_id,
      wholesale_reference_id,
      type,
      quantity,
      reason,
      reference_type,
      reference_id,
      performed_by
    )
    values (
      p_store_id,
      v_reference_id,
      'out',
      v_qty,
      concat('Venta confeccion ', v_invoice_number),
      'wholesale_sale',
      v_invoice_id,
      p_created_by
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
      'is_credit', true,
      'due_date', v_due_date,
      'balance_due', v_grand_total
    )
  );

  return query select v_invoice_id, v_invoice_number;
end;
$$;

grant execute on function public.create_wholesale_invoice_transaction(uuid, uuid, text, text, numeric, boolean, date, text, text, text, jsonb) to authenticated;

drop function if exists public.void_wholesale_invoice_transaction(uuid, uuid);

create or replace function public.void_wholesale_invoice_transaction(
  p_invoice_id uuid,
  p_actor_user_id uuid
)
returns table (invoice_id uuid, status text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice record;
  v_item record;
begin
  select wi.id, wi.store_id, wi.invoice_number, wi.status
  into v_invoice
  from public.wholesale_invoices wi
  where wi.id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Factura de confeccion no encontrada.';
  end if;

  if not (v_invoice.store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin y super_admin pueden anular facturas de confeccion.';
  end if;

  if v_invoice.status = 'void' then
    return query select v_invoice.id::uuid, v_invoice.status::text;
    return;
  end if;

  for v_item in
    select wholesale_reference_id, quantity
    from public.wholesale_invoice_items
    where wholesale_invoice_id = v_invoice.id
      and wholesale_reference_id is not null
  loop
    update public.wholesale_references
    set quantity_on_hand = quantity_on_hand + v_item.quantity,
        updated_at = now()
    where id = v_item.wholesale_reference_id;

    insert into public.wholesale_reference_movements (
      store_id,
      wholesale_reference_id,
      type,
      quantity,
      reason,
      reference_type,
      reference_id,
      performed_by
    )
    values (
      v_invoice.store_id,
      v_item.wholesale_reference_id,
      'in',
      v_item.quantity,
      concat('Anulacion factura confeccion ', v_invoice.invoice_number),
      'wholesale_void',
      v_invoice.id,
      p_actor_user_id
    );
  end loop;

  update public.wholesale_invoices
  set status = 'void',
      is_active = false,
      balance_due = 0
  where id = v_invoice.id;

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
    'wholesale_invoice_voided',
    'wholesale_invoices',
    v_invoice.id,
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'status', 'void'
    )
  );

  return query
  select wi.id::uuid, wi.status::text
  from public.wholesale_invoices wi
  where wi.id = v_invoice.id;
end;
$$;

grant execute on function public.void_wholesale_invoice_transaction(uuid, uuid) to authenticated;