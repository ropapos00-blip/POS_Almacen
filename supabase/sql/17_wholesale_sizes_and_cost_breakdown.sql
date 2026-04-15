-- 17_wholesale_sizes_and_cost_breakdown.sql
-- Confeccion: costos por insumo + tallas dinamicas por referencia + factura con talla.

alter table public.wholesale_references
  add column if not exists total_investment numeric(12,2) not null default 0;

alter table public.wholesale_references
  add column if not exists cost_breakdown jsonb not null default '{}'::jsonb;

alter table public.wholesale_references
  add column if not exists size_quantities jsonb not null default '{}'::jsonb;

alter table public.wholesale_references
  add column if not exists design_enabled boolean not null default false;

alter table public.wholesale_invoice_items
  add column if not exists size text;

-- Recalcula cantidad total desde talla por referencia cuando exista informacion.
update public.wholesale_references wr
set quantity_on_hand = sq.total_qty,
    updated_at = now()
from (
  select
    id,
    coalesce(sum((value)::integer), 0) as total_qty
  from public.wholesale_references,
  lateral jsonb_each_text(coalesce(size_quantities, '{}'::jsonb))
  group by id
) sq
where wr.id = sq.id;

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
  v_size text;
  v_ref record;
  v_available_size_qty integer;
  v_remaining_size_qty integer;
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
    v_size := upper(trim(coalesce(v_item->>'size', '')));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    if v_reference_id is null then
      raise exception 'Cada item debe incluir reference_id.';
    end if;

    if v_size = '' then
      raise exception 'Cada item debe incluir talla.';
    end if;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en items.';
    end if;

    select id, store_id, reference, unit_price, quantity_on_hand, size_quantities
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

    v_available_size_qty := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);

    if v_available_size_qty < v_qty then
      raise exception 'Stock insuficiente para referencia % talla %.', v_ref.reference, v_size;
    end if;

    if coalesce(v_ref.quantity_on_hand, 0) < v_qty then
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
    v_size := upper(trim(coalesce(v_item->>'size', '')));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    select id, reference, unit_price, quantity_on_hand, size_quantities
    into v_ref
    from public.wholesale_references
    where id = v_reference_id
    for update;

    v_line_total := v_qty * coalesce(v_ref.unit_price, 0);

    insert into public.wholesale_invoice_items (
      wholesale_invoice_id,
      wholesale_reference_id,
      reference,
      size,
      description,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_invoice_id,
      v_reference_id,
      v_ref.reference,
      v_size,
      v_ref.reference,
      v_qty,
      coalesce(v_ref.unit_price, 0),
      v_line_total
    );

    v_available_size_qty := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);
    v_remaining_size_qty := greatest(v_available_size_qty - v_qty, 0);

    update public.wholesale_references
    set quantity_on_hand = greatest(quantity_on_hand - v_qty, 0),
        size_quantities = jsonb_set(coalesce(size_quantities, '{}'::jsonb), array[v_size], to_jsonb(v_remaining_size_qty), true),
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
      concat('Venta confeccion ', v_invoice_number, ' talla ', v_size),
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
  v_size text;
  v_qty integer;
  v_subtotal numeric := 0;
  v_discount_total numeric := coalesce(p_discount_total, 0);
  v_grand_total numeric := 0;
  v_new_balance numeric := 0;
  v_invoice_number text;
  v_available_size_qty integer;
  v_remaining_size_qty integer;
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
    select wholesale_reference_id, size, quantity
    from public.wholesale_invoice_items
    where wholesale_invoice_id = v_invoice.id
      and wholesale_reference_id is not null
  loop
    update public.wholesale_references
    set quantity_on_hand = quantity_on_hand + v_old_item.quantity,
        size_quantities = jsonb_set(
          coalesce(size_quantities, '{}'::jsonb),
          array[upper(trim(coalesce(v_old_item.size, 'UNICA')))],
          to_jsonb(coalesce((coalesce(size_quantities, '{}'::jsonb) ->> upper(trim(coalesce(v_old_item.size, 'UNICA'))))::integer, 0) + v_old_item.quantity),
          true
        ),
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
      concat('Edicion factura confeccion (reversion) ', v_invoice.invoice_number, ' talla ', coalesce(v_old_item.size, 'UNICA')),
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
    v_size := upper(trim(coalesce(v_item->>'size', '')));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    if v_reference_id is null then
      raise exception 'Cada item debe incluir reference_id.';
    end if;

    if v_size = '' then
      raise exception 'Cada item debe incluir talla.';
    end if;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en items.';
    end if;

    select id, store_id, reference, unit_price, quantity_on_hand, size_quantities
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

    v_available_size_qty := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);

    if v_available_size_qty < v_qty then
      raise exception 'Stock insuficiente para referencia % talla %.', v_ref.reference, v_size;
    end if;

    if coalesce(v_ref.quantity_on_hand, 0) < v_qty then
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
    v_size := upper(trim(coalesce(v_item->>'size', '')));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    select id, reference, unit_price, size_quantities
    into v_ref
    from public.wholesale_references
    where id = v_reference_id
    for update;

    insert into public.wholesale_invoice_items (
      wholesale_invoice_id,
      wholesale_reference_id,
      reference,
      size,
      description,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_invoice.id,
      v_reference_id,
      v_ref.reference,
      v_size,
      v_ref.reference,
      v_qty,
      coalesce(v_ref.unit_price, 0),
      v_qty * coalesce(v_ref.unit_price, 0)
    );

    v_available_size_qty := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);
    v_remaining_size_qty := greatest(v_available_size_qty - v_qty, 0);

    update public.wholesale_references
    set quantity_on_hand = greatest(quantity_on_hand - v_qty, 0),
        size_quantities = jsonb_set(coalesce(size_quantities, '{}'::jsonb), array[v_size], to_jsonb(v_remaining_size_qty), true),
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
      concat('Edicion factura confeccion ', v_invoice_number, ' talla ', v_size),
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
    select wholesale_reference_id, size, quantity
    from public.wholesale_invoice_items
    where wholesale_invoice_id = v_invoice.id
      and wholesale_reference_id is not null
  loop
    update public.wholesale_references
    set quantity_on_hand = quantity_on_hand + v_item.quantity,
        size_quantities = jsonb_set(
          coalesce(size_quantities, '{}'::jsonb),
          array[upper(trim(coalesce(v_item.size, 'UNICA')))],
          to_jsonb(coalesce((coalesce(size_quantities, '{}'::jsonb) ->> upper(trim(coalesce(v_item.size, 'UNICA'))))::integer, 0) + v_item.quantity),
          true
        ),
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
      concat('Anulacion factura confeccion ', v_invoice.invoice_number, ' talla ', coalesce(v_item.size, 'UNICA')),
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
