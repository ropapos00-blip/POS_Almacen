-- 14_wholesale_edit_and_finance.sql
-- Confeccion: edicion completa de facturas + movimientos financieros (ingreso/gasto/inversion).

alter table public.wholesale_reference_movements
  add column if not exists investment_amount numeric(12,2) not null default 0;

create table if not exists public.wholesale_finance_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  kind text not null check (kind in ('income', 'expense', 'investment')),
  amount numeric(12,2) not null check (amount > 0),
  movement_date date not null default current_date,
  source_reference_movement_id uuid null references public.wholesale_reference_movements(id) on delete set null,
  category text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.wholesale_finance_movements
  add column if not exists source_reference_movement_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wholesale_finance_movements_source_reference_movement_id_fkey'
  ) then
    alter table public.wholesale_finance_movements
      add constraint wholesale_finance_movements_source_reference_movement_id_fkey
      foreign key (source_reference_movement_id)
      references public.wholesale_reference_movements(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_wholesale_finance_movements_store_date
  on public.wholesale_finance_movements (store_id, movement_date desc, created_at desc);

create index if not exists idx_wholesale_finance_movements_source_reference
  on public.wholesale_finance_movements (source_reference_movement_id);

create unique index if not exists uq_wholesale_finance_source_reference_movement
  on public.wholesale_finance_movements (source_reference_movement_id)
  where source_reference_movement_id is not null;

alter table public.wholesale_finance_movements enable row level security;

drop policy if exists wholesale_finance_movements_read_policy on public.wholesale_finance_movements;
create policy wholesale_finance_movements_read_policy on public.wholesale_finance_movements
for select
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

drop policy if exists wholesale_finance_movements_write_policy on public.wholesale_finance_movements;
create policy wholesale_finance_movements_write_policy on public.wholesale_finance_movements
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

drop function if exists public.create_wholesale_finance_movement(uuid, uuid, text, numeric, date, text, text);
create or replace function public.create_wholesale_finance_movement(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_kind text,
  p_amount numeric,
  p_movement_date date,
  p_category text default null,
  p_notes text default null
)
returns table (movement_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movement_id uuid;
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin y super_admin pueden registrar movimientos financieros.';
  end if;

  if p_kind not in ('income', 'expense', 'investment') then
    raise exception 'Tipo de movimiento financiero invalido.';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  insert into public.wholesale_finance_movements (
    store_id,
    kind,
    amount,
    movement_date,
    category,
    notes,
    created_by
  )
  values (
    p_store_id,
    p_kind,
    p_amount,
    coalesce(p_movement_date, current_date),
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_actor_user_id
  )
  returning id into v_movement_id;

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
    p_actor_user_id,
    'wholesale_finance_movement_created',
    'wholesale_finance_movements',
    v_movement_id,
    jsonb_build_object(
      'kind', p_kind,
      'amount', p_amount,
      'movement_date', coalesce(p_movement_date, current_date),
      'category', nullif(trim(coalesce(p_category, '')), '')
    )
  );

  return query
  select v_movement_id;
end;
$$;

grant execute on function public.create_wholesale_finance_movement(uuid, uuid, text, numeric, date, text, text) to authenticated;

drop trigger if exists trg_sync_wholesale_investment_from_reference_movement on public.wholesale_reference_movements;
drop function if exists public.sync_wholesale_investment_from_reference_movement();
create or replace function public.sync_wholesale_investment_from_reference_movement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_unit_price numeric := 0;
  v_amount numeric := 0;
begin
  if new.type <> 'in' then
    return new;
  end if;

  if coalesce(new.reference_type, '') not in ('reference_create', 'reference_restock') then
    return new;
  end if;

  v_amount := coalesce(new.investment_amount, 0);

  if v_amount <= 0 then
    select coalesce(unit_price, 0)
  into v_unit_price
  from public.wholesale_references
  where id = new.wholesale_reference_id;

    v_amount := coalesce(new.quantity, 0) * v_unit_price;
  end if;

  if v_amount <= 0 then
    return new;
  end if;

  insert into public.wholesale_finance_movements (
    store_id,
    kind,
    amount,
    movement_date,
    source_reference_movement_id,
    category,
    notes,
    created_by
  )
  select
    new.store_id,
    'investment',
    v_amount,
    (new.created_at at time zone 'utc')::date,
    new.id,
    'Inventario confeccion',
    coalesce(new.reason, 'Inversion automatica por entrada de inventario confeccion'),
    new.performed_by
  where not exists (
    select 1
    from public.wholesale_finance_movements fm
    where fm.source_reference_movement_id = new.id
  );

  return new;
end;
$$;
create trigger trg_sync_wholesale_investment_from_reference_movement
after insert on public.wholesale_reference_movements
for each row
execute function public.sync_wholesale_investment_from_reference_movement();

drop function if exists public.update_wholesale_invoice_transaction(uuid, uuid, text, text, text, numeric, jsonb);
create or replace function public.update_wholesale_invoice_transaction(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_invoice_number text,
  p_customer_name text,
  p_customer_phone text,
  p_discount_total numeric,
  p_items jsonb
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.wholesale_invoices%rowtype;
  v_old_item record;
  v_item jsonb;
  v_ref record;
  v_reference_id uuid;
  v_qty integer;
  v_subtotal numeric := 0;
  v_discount_total numeric := coalesce(p_discount_total, 0);
  v_grand_total numeric := 0;
  v_new_balance numeric := 0;
  v_invoice_number text;
begin
  select *
  into v_invoice
  from public.wholesale_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Factura de confeccion no encontrada.';
  end if;

  if v_invoice.status = 'void' then
    raise exception 'No se puede editar una factura anulada.';
  end if;

  if not (v_invoice.store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin y super_admin pueden editar facturas de confeccion.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura debe tener al menos un item.';
  end if;

  v_invoice_number := trim(coalesce(p_invoice_number, ''));
  if v_invoice_number = '' then
    raise exception 'El numero de factura es obligatorio.';
  end if;

  if exists (
    select 1
    from public.wholesale_invoices wi
    where wi.store_id = v_invoice.store_id
      and wi.invoice_number = v_invoice_number
      and wi.id <> v_invoice.id
  ) then
    raise exception 'El numero de factura ya existe en la tienda.';
  end if;

  for v_old_item in
    select wholesale_reference_id, quantity
    from public.wholesale_invoice_items
    where wholesale_invoice_id = v_invoice.id
      and wholesale_reference_id is not null
  loop
    update public.wholesale_references
    set quantity_on_hand = quantity_on_hand + v_old_item.quantity,
        updated_at = now()
    where id = v_old_item.wholesale_reference_id;

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
      v_old_item.wholesale_reference_id,
      'in',
      v_old_item.quantity,
      concat('Edicion factura confeccion (reversion) ', v_invoice.invoice_number),
      'wholesale_edit_revert',
      v_invoice.id,
      p_actor_user_id
    );
  end loop;

  delete from public.wholesale_invoice_items
  where wholesale_invoice_id = v_invoice.id;

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

    if v_ref.store_id <> v_invoice.store_id then
      raise exception 'Referencia fuera de la tienda activa.';
    end if;

    if v_ref.quantity_on_hand < v_qty then
      raise exception 'Stock de confeccion insuficiente para la referencia %.', v_ref.reference;
    end if;

    v_subtotal := v_subtotal + (v_qty * coalesce(v_ref.unit_price, 0));
  end loop;

  if v_discount_total < 0 then
    raise exception 'Descuento invalido.';
  end if;

  if v_discount_total > v_subtotal then
    raise exception 'Descuento no puede superar subtotal.';
  end if;

  v_grand_total := v_subtotal - v_discount_total;
  v_new_balance := greatest(v_grand_total - coalesce(v_invoice.paid_total, 0), 0);

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
      v_invoice.id,
      v_reference_id,
      v_ref.reference,
      v_ref.reference,
      v_qty,
      coalesce(v_ref.unit_price, 0),
      v_qty * coalesce(v_ref.unit_price, 0)
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
      v_invoice.store_id,
      v_reference_id,
      'out',
      v_qty,
      concat('Edicion factura confeccion ', v_invoice_number),
      'wholesale_edit_apply',
      v_invoice.id,
      p_actor_user_id
    );
  end loop;

  update public.wholesale_invoices
  set
    invoice_number = v_invoice_number,
    customer_name = nullif(trim(coalesce(p_customer_name, '')), ''),
    customer_phone = nullif(trim(coalesce(p_customer_phone, '')), ''),
    subtotal = v_subtotal,
    discount_total = v_discount_total,
    grand_total = v_grand_total,
    balance_due = v_new_balance
  where id = v_invoice.id;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_before,
    payload_after
  )
  values (
    v_invoice.store_id,
    p_actor_user_id,
    'wholesale_invoice_updated',
    'wholesale_invoices',
    v_invoice.id,
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'subtotal', v_invoice.subtotal,
      'discount_total', v_invoice.discount_total,
      'grand_total', v_invoice.grand_total,
      'balance_due', v_invoice.balance_due
    ),
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'subtotal', v_subtotal,
      'discount_total', v_discount_total,
      'grand_total', v_grand_total,
      'balance_due', v_new_balance
    )
  );

  return query
  select v_invoice.id, v_invoice_number;
end;
$$;

grant execute on function public.update_wholesale_invoice_transaction(uuid, uuid, text, text, text, numeric, jsonb) to authenticated;
