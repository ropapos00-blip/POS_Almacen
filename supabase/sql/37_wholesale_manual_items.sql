-- 37_wholesale_manual_items.sql
-- Permite items manuales (sin referencia de inventario) en facturas de confeccion.
-- Items con reference_id = null se insertan directamente con description + unit_price.
-- Referencias sin size_quantities usan quantity_on_hand como fallback de stock.

-- ============================================================
-- 1. Recreate create_wholesale_invoice_transaction
-- ============================================================
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
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 0;
  v_grand_total numeric := 0;
  v_balance_due numeric := 0;
  v_payment_method text;
  v_due_date date;
  v_item jsonb;
  v_ref record;
  v_qty integer;
  v_size text;
  v_color text;
  v_line_total numeric;
  v_available_qty integer;
  v_remaining_qty integer;
  v_has_color_matrix boolean;
  v_size_available integer;
  v_size_remaining integer;
  v_unit_price numeric;
  v_description text;
  v_use_qoh_fallback boolean;
begin
  if p_store_id is null or p_created_by is null then
    raise exception 'Datos obligatorios incompletos para crear la factura.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura de confeccion requiere al menos un item.';
  end if;

  if not exists (
    select 1
    from public.user_store_roles usr
    where usr.store_id = p_store_id
      and usr.user_id = p_created_by
      and usr.is_active = true
  ) then
    raise exception 'No autorizado para crear facturas en esta tienda.';
  end if;

  v_payment_method := case
    when coalesce(trim(p_payment_method), '') = '' then
      case when p_is_credit then 'credit' else 'cash' end
    else lower(trim(p_payment_method))
  end;

  if p_is_credit then
    v_due_date := coalesce(p_due_date, (now() at time zone 'America/Bogota')::date + 30);
  else
    v_due_date := null;
  end if;

  -- First pass: validate and compute subtotal
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::integer, 0));

    if coalesce(v_item ->> 'reference_id', '') = '' then
      -- Manual item: requires description
      v_description := trim(coalesce(v_item ->> 'description', ''));
      if v_description = '' then
        raise exception 'Los items manuales deben incluir una descripcion.';
      end if;
      v_unit_price := greatest(0, coalesce((v_item ->> 'unit_price')::numeric, 0));
      v_line_total := v_qty * v_unit_price;
    else
      -- Inventory item: validate stock
      v_size := upper(trim(coalesce(v_item ->> 'size', 'UNICA')));
      v_color := upper(trim(coalesce(v_item ->> 'color', 'UNICO')));

      select id, store_id, reference, unit_price, quantity_on_hand, size_quantities, color_quantities
      into v_ref
      from public.wholesale_references
      where id = (v_item ->> 'reference_id')::uuid
        and is_active = true
      for update;

      if not found then
        raise exception 'Referencia no encontrada o inactiva.';
      end if;

      if v_ref.store_id <> p_store_id then
        raise exception 'La referencia % no pertenece a la tienda.', v_ref.reference;
      end if;

      v_has_color_matrix := jsonb_typeof(coalesce(v_ref.color_quantities, '{}'::jsonb)) = 'object'
        and coalesce(v_ref.color_quantities, '{}'::jsonb) <> '{}'::jsonb;

      v_use_qoh_fallback := false;
      if v_has_color_matrix then
        v_available_qty := coalesce((coalesce(v_ref.color_quantities, '{}'::jsonb) -> v_color ->> v_size)::integer, 0);
      else
        v_available_qty := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);
        -- Fallback: reference has no size tracking → use quantity_on_hand
        if v_available_qty = 0 and (
          coalesce(v_ref.size_quantities, '{}'::jsonb) = '{}'::jsonb
          or not (coalesce(v_ref.size_quantities, '{}'::jsonb) ? v_size)
        ) then
          v_available_qty := coalesce(v_ref.quantity_on_hand, 0);
          v_use_qoh_fallback := true;
        end if;
      end if;

      if v_available_qty < v_qty then
        raise exception 'Stock insuficiente para % (% / %). Disponible: %, solicitado: %.',
          v_ref.reference, v_color, v_size, v_available_qty, v_qty;
      end if;

      v_line_total := v_qty * coalesce(v_ref.unit_price, 0);
    end if;

    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_grand_total := greatest(0, v_subtotal - greatest(0, coalesce(p_discount_total, 0)));
  v_balance_due := case when p_is_credit then v_grand_total else 0 end;

  insert into public.wholesale_invoices as wi (
    store_id, invoice_number, customer_name, customer_phone, issued_at, due_date,
    subtotal, discount_total, grand_total, paid_total, balance_due,
    is_credit, status, payment_method, payment_reference, notes, created_by
  )
  values (
    p_store_id,
    public.next_wholesale_invoice_number(p_store_id),
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_phone), ''),
    timezone('America/Bogota', now()),
    v_due_date,
    v_subtotal,
    greatest(0, coalesce(p_discount_total, 0)),
    v_grand_total,
    case when p_is_credit then 0 else v_grand_total end,
    v_balance_due,
    p_is_credit,
    case when p_is_credit then 'issued' else 'paid' end,
    v_payment_method,
    nullif(trim(p_payment_reference), ''),
    nullif(trim(p_notes), ''),
    p_created_by
  )
  returning wi.id, wi.invoice_number into v_invoice_id, v_invoice_number;

  -- Second pass: insert items and deduct inventory
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::integer, 0));

    if coalesce(v_item ->> 'reference_id', '') = '' then
      -- Manual item: insert without inventory deduction
      v_description := trim(coalesce(v_item ->> 'description', ''));
      v_unit_price := greatest(0, coalesce((v_item ->> 'unit_price')::numeric, 0));
      v_line_total := v_qty * v_unit_price;

      insert into public.wholesale_invoice_items (
        wholesale_invoice_id, wholesale_reference_id, variant_id,
        reference, color, size, description, quantity, unit_price, line_total
      ) values (
        v_invoice_id, null, null,
        null, null, null, v_description, v_qty, v_unit_price, v_line_total
      );
    else
      -- Inventory item: insert and deduct stock
      v_size := upper(trim(coalesce(v_item ->> 'size', 'UNICA')));
      v_color := upper(trim(coalesce(v_item ->> 'color', 'UNICO')));

      select id, reference, unit_price, quantity_on_hand, size_quantities, color_quantities
      into v_ref
      from public.wholesale_references
      where id = (v_item ->> 'reference_id')::uuid
      for update;

      v_line_total := v_qty * coalesce(v_ref.unit_price, 0);

      insert into public.wholesale_invoice_items (
        wholesale_invoice_id, wholesale_reference_id, variant_id,
        reference, color, size, description, quantity, unit_price, line_total
      ) values (
        v_invoice_id, v_ref.id, null,
        v_ref.reference, v_color, v_size, v_ref.reference, v_qty,
        coalesce(v_ref.unit_price, 0), v_line_total
      );

      v_has_color_matrix := jsonb_typeof(coalesce(v_ref.color_quantities, '{}'::jsonb)) = 'object'
        and coalesce(v_ref.color_quantities, '{}'::jsonb) <> '{}'::jsonb;

      v_use_qoh_fallback := not v_has_color_matrix and (
        coalesce(v_ref.size_quantities, '{}'::jsonb) = '{}'::jsonb
        or not (coalesce(v_ref.size_quantities, '{}'::jsonb) ? v_size)
      );

      if v_has_color_matrix then
        v_available_qty := coalesce((coalesce(v_ref.color_quantities, '{}'::jsonb) -> v_color ->> v_size)::integer, 0);
        v_remaining_qty := greatest(0, v_available_qty - v_qty);
        v_size_available := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);
        v_size_remaining := greatest(0, v_size_available - v_qty);

        update public.wholesale_references
        set
          quantity_on_hand = greatest(0, coalesce(quantity_on_hand, 0) - v_qty),
          size_quantities = jsonb_set(coalesce(size_quantities, '{}'::jsonb), array[v_size], to_jsonb(v_size_remaining), true),
          color_quantities = jsonb_set(coalesce(color_quantities, '{}'::jsonb), array[v_color, v_size], to_jsonb(v_remaining_qty), true),
          updated_at = timezone('America/Bogota', now())
        where id = v_ref.id;
      elsif v_use_qoh_fallback then
        -- Simple reference without size tracking: deduct only from quantity_on_hand
        update public.wholesale_references
        set
          quantity_on_hand = greatest(0, coalesce(quantity_on_hand, 0) - v_qty),
          updated_at = timezone('America/Bogota', now())
        where id = v_ref.id;
      else
        v_size_available := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);
        v_size_remaining := greatest(0, v_size_available - v_qty);

        update public.wholesale_references
        set
          quantity_on_hand = greatest(0, coalesce(quantity_on_hand, 0) - v_qty),
          size_quantities = jsonb_set(coalesce(size_quantities, '{}'::jsonb), array[v_size], to_jsonb(v_size_remaining), true),
          updated_at = timezone('America/Bogota', now())
        where id = v_ref.id;
      end if;
    end if;
  end loop;

  if to_regprocedure('public.create_notification(uuid,text,text,uuid,text,jsonb)') is not null then
    perform public.create_notification(
      p_store_id,
      'wholesale_invoices',
      'create',
      v_invoice_id,
      format('Factura confeccion %s creada.', v_invoice_number),
      jsonb_build_object(
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'grand_total', v_grand_total
      )
    );
  end if;

  return query select v_invoice_id, v_invoice_number;
end;
$$;

-- ============================================================
-- 2. Recreate update_wholesale_invoice_transaction
--    - Allows manual items (no reference_id)
-- ============================================================
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
security definer
set search_path = public
as $$
declare
  v_invoice public.wholesale_invoices%rowtype;
  v_item jsonb;
  v_old_item record;
  v_ref record;
  v_qty integer;
  v_size text;
  v_color text;
  v_subtotal numeric := 0;
  v_grand_total numeric := 0;
  v_balance_due numeric := 0;
  v_line_total numeric := 0;
  v_available_qty integer;
  v_remaining_qty integer;
  v_has_color_matrix boolean;
  v_size_available integer;
  v_size_remaining integer;
  v_same_store boolean;
  v_unit_price numeric;
  v_description text;
  v_use_qoh_fallback boolean;
begin
  if p_invoice_id is null or p_actor_user_id is null then
    raise exception 'Datos obligatorios incompletos para editar la factura.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura de confeccion requiere al menos un item.';
  end if;

  select *
  into v_invoice
  from public.wholesale_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Factura no encontrada.';
  end if;

  if v_invoice.status = 'void' then
    raise exception 'No se puede editar una factura anulada.';
  end if;

  select exists (
    select 1
    from public.user_store_roles usr
    where usr.store_id = v_invoice.store_id
      and usr.user_id = p_actor_user_id
      and usr.is_active = true
  ) into v_same_store;

  if not v_same_store then
    raise exception 'No autorizado para editar esta factura.';
  end if;

  -- Restore stock for old inventory items (skip manual items: wholesale_reference_id IS NULL)
  for v_old_item in
    select wholesale_reference_id, quantity, coalesce(color, 'UNICO') as color, coalesce(size, 'UNICA') as size
    from public.wholesale_invoice_items
    where wholesale_invoice_id = p_invoice_id
      and wholesale_reference_id is not null
  loop
    select id, size_quantities, color_quantities
    into v_ref
    from public.wholesale_references
    where id = v_old_item.wholesale_reference_id
    for update;

    if found then
      v_color := upper(trim(coalesce(v_old_item.color, 'UNICO')));
      v_size := upper(trim(coalesce(v_old_item.size, 'UNICA')));
      v_has_color_matrix := jsonb_typeof(coalesce(v_ref.color_quantities, '{}'::jsonb)) = 'object'
        and coalesce(v_ref.color_quantities, '{}'::jsonb) <> '{}'::jsonb;

      if v_has_color_matrix then
        update public.wholesale_references
        set
          quantity_on_hand = coalesce(quantity_on_hand, 0) + v_old_item.quantity,
          size_quantities = jsonb_set(
            coalesce(size_quantities, '{}'::jsonb), array[v_size],
            to_jsonb(coalesce((coalesce(size_quantities, '{}'::jsonb) ->> v_size)::integer, 0) + v_old_item.quantity), true
          ),
          color_quantities = jsonb_set(
            coalesce(color_quantities, '{}'::jsonb), array[v_color, v_size],
            to_jsonb(coalesce((coalesce(color_quantities, '{}'::jsonb) -> v_color ->> v_size)::integer, 0) + v_old_item.quantity), true
          ),
          updated_at = timezone('America/Bogota', now())
        where id = v_ref.id;
      else
        update public.wholesale_references
        set
          quantity_on_hand = coalesce(quantity_on_hand, 0) + v_old_item.quantity,
          size_quantities = jsonb_set(
            coalesce(size_quantities, '{}'::jsonb), array[v_size],
            to_jsonb(coalesce((coalesce(size_quantities, '{}'::jsonb) ->> v_size)::integer, 0) + v_old_item.quantity), true
          ),
          updated_at = timezone('America/Bogota', now())
        where id = v_ref.id;
      end if;
    end if;
  end loop;

  delete from public.wholesale_invoice_items
  where wholesale_invoice_id = p_invoice_id;

  -- Validate new items and compute subtotal
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::integer, 0));

    if coalesce(v_item ->> 'reference_id', '') = '' then
      -- Manual item
      v_description := trim(coalesce(v_item ->> 'description', ''));
      if v_description = '' then
        raise exception 'Los items manuales deben incluir una descripcion.';
      end if;
      v_unit_price := greatest(0, coalesce((v_item ->> 'unit_price')::numeric, 0));
      v_line_total := v_qty * v_unit_price;
    else
      -- Inventory item
      v_size := upper(trim(coalesce(v_item ->> 'size', 'UNICA')));
      v_color := upper(trim(coalesce(v_item ->> 'color', 'UNICO')));

      select id, store_id, reference, unit_price, quantity_on_hand, size_quantities, color_quantities
      into v_ref
      from public.wholesale_references
      where id = (v_item ->> 'reference_id')::uuid
        and is_active = true
      for update;

      if not found then
        raise exception 'Referencia no encontrada o inactiva.';
      end if;

      if v_ref.store_id <> v_invoice.store_id then
        raise exception 'La referencia % no pertenece a la tienda.', v_ref.reference;
      end if;

      v_has_color_matrix := jsonb_typeof(coalesce(v_ref.color_quantities, '{}'::jsonb)) = 'object'
        and coalesce(v_ref.color_quantities, '{}'::jsonb) <> '{}'::jsonb;

      v_use_qoh_fallback := false;
      if v_has_color_matrix then
        v_available_qty := coalesce((coalesce(v_ref.color_quantities, '{}'::jsonb) -> v_color ->> v_size)::integer, 0);
      else
        v_available_qty := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);
        if v_available_qty = 0 and (
          coalesce(v_ref.size_quantities, '{}'::jsonb) = '{}'::jsonb
          or not (coalesce(v_ref.size_quantities, '{}'::jsonb) ? v_size)
        ) then
          v_available_qty := coalesce(v_ref.quantity_on_hand, 0);
          v_use_qoh_fallback := true;
        end if;
      end if;

      if v_available_qty < v_qty then
        raise exception 'Stock insuficiente para % (% / %). Disponible: %, solicitado: %.',
          v_ref.reference, v_color, v_size, v_available_qty, v_qty;
      end if;

      v_line_total := v_qty * coalesce(v_ref.unit_price, 0);
    end if;

    v_subtotal := v_subtotal + v_line_total;
  end loop;

  -- Insert new items and deduct inventory
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::integer, 0));

    if coalesce(v_item ->> 'reference_id', '') = '' then
      -- Manual item
      v_description := trim(coalesce(v_item ->> 'description', ''));
      v_unit_price := greatest(0, coalesce((v_item ->> 'unit_price')::numeric, 0));
      v_line_total := v_qty * v_unit_price;

      insert into public.wholesale_invoice_items (
        wholesale_invoice_id, wholesale_reference_id, variant_id,
        reference, color, size, description, quantity, unit_price, line_total
      ) values (
        p_invoice_id, null, null,
        null, null, null, v_description, v_qty, v_unit_price, v_line_total
      );
    else
      -- Inventory item
      v_size := upper(trim(coalesce(v_item ->> 'size', 'UNICA')));
      v_color := upper(trim(coalesce(v_item ->> 'color', 'UNICO')));

      select id, reference, unit_price, quantity_on_hand, size_quantities, color_quantities
      into v_ref
      from public.wholesale_references
      where id = (v_item ->> 'reference_id')::uuid
      for update;

      v_line_total := v_qty * coalesce(v_ref.unit_price, 0);

      insert into public.wholesale_invoice_items (
        wholesale_invoice_id, wholesale_reference_id, variant_id,
        reference, color, size, description, quantity, unit_price, line_total
      ) values (
        p_invoice_id, v_ref.id, null,
        v_ref.reference, v_color, v_size, v_ref.reference, v_qty,
        coalesce(v_ref.unit_price, 0), v_line_total
      );

      v_has_color_matrix := jsonb_typeof(coalesce(v_ref.color_quantities, '{}'::jsonb)) = 'object'
        and coalesce(v_ref.color_quantities, '{}'::jsonb) <> '{}'::jsonb;

      v_use_qoh_fallback := not v_has_color_matrix and (
        coalesce(v_ref.size_quantities, '{}'::jsonb) = '{}'::jsonb
        or not (coalesce(v_ref.size_quantities, '{}'::jsonb) ? v_size)
      );

      if v_has_color_matrix then
        v_available_qty := coalesce((coalesce(v_ref.color_quantities, '{}'::jsonb) -> v_color ->> v_size)::integer, 0);
        v_remaining_qty := greatest(0, v_available_qty - v_qty);
        v_size_available := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);
        v_size_remaining := greatest(0, v_size_available - v_qty);

        update public.wholesale_references
        set
          quantity_on_hand = greatest(0, coalesce(quantity_on_hand, 0) - v_qty),
          size_quantities = jsonb_set(coalesce(size_quantities, '{}'::jsonb), array[v_size], to_jsonb(v_size_remaining), true),
          color_quantities = jsonb_set(coalesce(color_quantities, '{}'::jsonb), array[v_color, v_size], to_jsonb(v_remaining_qty), true),
          updated_at = timezone('America/Bogota', now())
        where id = v_ref.id;
      elsif v_use_qoh_fallback then
        update public.wholesale_references
        set
          quantity_on_hand = greatest(0, coalesce(quantity_on_hand, 0) - v_qty),
          updated_at = timezone('America/Bogota', now())
        where id = v_ref.id;
      else
        v_size_available := coalesce((coalesce(v_ref.size_quantities, '{}'::jsonb) ->> v_size)::integer, 0);
        v_size_remaining := greatest(0, v_size_available - v_qty);

        update public.wholesale_references
        set
          quantity_on_hand = greatest(0, coalesce(quantity_on_hand, 0) - v_qty),
          size_quantities = jsonb_set(coalesce(size_quantities, '{}'::jsonb), array[v_size], to_jsonb(v_size_remaining), true),
          updated_at = timezone('America/Bogota', now())
        where id = v_ref.id;
      end if;
    end if;
  end loop;

  v_grand_total := greatest(0, v_subtotal - greatest(0, coalesce(p_discount_total, 0)));
  v_balance_due := greatest(0, v_grand_total - coalesce(v_invoice.paid_total, 0));

  update public.wholesale_invoices
  set
    invoice_number = nullif(trim(p_invoice_number), ''),
    customer_name = nullif(trim(p_customer_name), ''),
    customer_phone = nullif(trim(p_customer_phone), ''),
    subtotal = v_subtotal,
    discount_total = greatest(0, coalesce(p_discount_total, 0)),
    grand_total = v_grand_total,
    balance_due = v_balance_due,
    status = case
      when coalesce(v_invoice.paid_total, 0) <= 0 then 'issued'
      when coalesce(v_invoice.paid_total, 0) < v_grand_total then 'partial'
      else 'paid'
    end
  where id = p_invoice_id;

  if to_regprocedure('public.create_notification(uuid,text,text,uuid,text,jsonb)') is not null then
    perform public.create_notification(
      v_invoice.store_id,
      'wholesale_invoices',
      'update',
      p_invoice_id,
      format('Factura confeccion %s actualizada.', coalesce(nullif(trim(p_invoice_number), ''), v_invoice.invoice_number)),
      jsonb_build_object(
        'invoice_id', p_invoice_id,
        'invoice_number', coalesce(nullif(trim(p_invoice_number), ''), v_invoice.invoice_number),
        'grand_total', v_grand_total
      )
    );
  end if;

  return query
    select p_invoice_id, coalesce(nullif(trim(p_invoice_number), ''), v_invoice.invoice_number);
end;
$$;

grant execute on function public.create_wholesale_invoice_transaction(uuid, uuid, text, text, numeric, boolean, date, text, text, text, jsonb) to authenticated;
grant execute on function public.update_wholesale_invoice_transaction(uuid, uuid, text, text, text, numeric, jsonb) to authenticated;

revoke execute on function public.create_wholesale_invoice_transaction(uuid, uuid, text, text, numeric, boolean, date, text, text, text, jsonb) from anon, public;
revoke execute on function public.update_wholesale_invoice_transaction(uuid, uuid, text, text, text, numeric, jsonb) from anon, public;
