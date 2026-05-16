-- 44_manual_invoice_exchange_transaction.sql
-- Cambio de articulos en facturas manuales:
-- 1) devuelve items seleccionados (reintegra inventario)
-- 2) crea nueva factura con los articulos de cambio
-- 3) aplica automaticamente el saldo generado por la devolucion
-- 4) permite cobrar excedente con metodo de pago

create table if not exists public.manual_invoice_exchanges (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  source_invoice_id uuid not null references public.manual_invoices(id) on delete restrict,
  return_id uuid not null references public.manual_invoice_returns(id) on delete restrict,
  new_invoice_id uuid not null references public.manual_invoices(id) on delete restrict,
  reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_manual_invoice_exchanges_store_created
  on public.manual_invoice_exchanges (store_id, created_at desc);

alter table public.manual_invoice_exchanges enable row level security;

drop policy if exists manual_invoice_exchanges_read_policy on public.manual_invoice_exchanges;
create policy manual_invoice_exchanges_read_policy on public.manual_invoice_exchanges
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists manual_invoice_exchanges_write_policy on public.manual_invoice_exchanges;
create policy manual_invoice_exchanges_write_policy on public.manual_invoice_exchanges
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

drop function if exists public.create_manual_invoice_exchange_transaction(uuid, uuid, jsonb, jsonb, text, numeric, text, text, text, text, numeric);
drop function if exists public.create_manual_invoice_exchange_transaction(uuid, uuid, jsonb, jsonb, text, numeric, text, text, text, text);

create or replace function public.create_manual_invoice_exchange_transaction(
  p_source_invoice_id uuid,
  p_actor_user_id uuid,
  p_return_items jsonb,
  p_new_items jsonb,
  p_reason text default null,
  p_discount_total numeric default 0,
  p_payment_method text default 'cash',
  p_payment_reference text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_apply_return_credit numeric default null
)
returns table (
  exchange_id uuid,
  return_id uuid,
  return_number text,
  new_invoice_id uuid,
  new_invoice_number text,
  credit_generated numeric,
  credit_applied numeric,
  additional_payment numeric,
  remaining_credit numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_invoice public.manual_invoices%rowtype;
  v_store_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_reason text;

  v_return_id uuid;
  v_return_number text;
  v_credit_generated numeric := 0;

  v_new_subtotal numeric := 0;
  v_new_discount numeric := greatest(0, coalesce(p_discount_total, 0));
  v_new_grand_total numeric := 0;
  v_apply_credit_requested numeric;
  v_apply_credit numeric := 0;

  v_new_invoice_id uuid;
  v_new_invoice_number text;
  v_additional_payment numeric := 0;
  v_exchange_id uuid;

  v_item jsonb;
  v_description text;
  v_qty integer;
  v_price numeric;
  v_phone_balance numeric := 0;
begin
  select *
  into v_source_invoice
  from public.manual_invoices
  where id = p_source_invoice_id
    and is_active = true;

  if not found then
    raise exception 'Factura origen no encontrada o anulada.';
  end if;

  v_store_id := v_source_invoice.store_id;

  if not (v_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda de la factura.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  ) then
    raise exception 'Usuario sin permisos para cambios de factura manual.';
  end if;

  if jsonb_typeof(p_new_items) <> 'array' or jsonb_array_length(p_new_items) = 0 then
    raise exception 'El cambio requiere al menos un nuevo articulo.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  v_customer_name := nullif(trim(coalesce(p_customer_name, v_source_invoice.customer_name, '')), '');
  v_customer_phone := nullif(trim(coalesce(p_customer_phone, v_source_invoice.customer_phone, '')), '');

  if v_customer_phone is null then
    raise exception 'El cambio requiere cliente con telefono para manejar saldo a favor.';
  end if;

  for v_item in select * from jsonb_array_elements(p_new_items)
  loop
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);

    if v_description = '' then
      raise exception 'Descripcion requerida en articulo de cambio.';
    end if;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en articulo de cambio.';
    end if;

    if v_price < 0 then
      raise exception 'Precio invalido en articulo de cambio.';
    end if;

    v_new_subtotal := v_new_subtotal + (v_qty * v_price);
  end loop;

  if v_new_discount > v_new_subtotal then
    raise exception 'El descuento no puede superar el subtotal del cambio.';
  end if;

  v_new_grand_total := v_new_subtotal - v_new_discount;

  select r.return_id, r.return_number, r.credit_amount
  into v_return_id, v_return_number, v_credit_generated
  from public.create_manual_invoice_return_transaction(
    p_source_invoice_id,
    p_actor_user_id,
    p_return_items,
    v_reason
  ) r
  limit 1;

  if v_return_id is null then
    raise exception 'No se pudo registrar la devolucion del cambio.';
  end if;

  v_apply_credit_requested := coalesce(p_apply_return_credit, v_credit_generated);
  v_apply_credit := least(greatest(0, v_apply_credit_requested), v_credit_generated, v_new_grand_total);

  select c.invoice_id, c.invoice_number
  into v_new_invoice_id, v_new_invoice_number
  from public.create_manual_invoice_transaction(
    p_store_id => v_store_id,
    p_created_by => p_actor_user_id,
    p_customer_name => v_customer_name,
    p_customer_phone => v_customer_phone,
    p_discount_total => v_new_discount,
    p_payment_method => p_payment_method,
    p_payment_reference => p_payment_reference,
    p_items => p_new_items,
    p_notes => nullif(trim(concat('Cambio de ', v_source_invoice.invoice_number, case when v_reason is not null then ' - ' || v_reason else '' end)), ''),
    p_apply_credit => v_apply_credit
  ) c
  limit 1;

  if v_new_invoice_id is null then
    raise exception 'No se pudo crear la nueva factura del cambio.';
  end if;

  select greatest(0, grand_total - credit_applied_total)
  into v_additional_payment
  from public.manual_invoices
  where id = v_new_invoice_id;

  select coalesce(micc.balance, 0)
  into v_phone_balance
  from public.manual_invoice_customer_credits micc
  where micc.store_id = v_store_id
    and micc.customer_phone = v_customer_phone;

  insert into public.manual_invoice_exchanges (
    store_id,
    source_invoice_id,
    return_id,
    new_invoice_id,
    reason,
    created_by
  )
  values (
    v_store_id,
    p_source_invoice_id,
    v_return_id,
    v_new_invoice_id,
    v_reason,
    p_actor_user_id
  )
  returning id into v_exchange_id;

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
    'manual_invoice_exchange_created',
    'manual_invoice_exchanges',
    v_exchange_id,
    jsonb_build_object(
      'source_invoice_id', p_source_invoice_id,
      'source_invoice_number', v_source_invoice.invoice_number,
      'return_id', v_return_id,
      'return_number', v_return_number,
      'new_invoice_id', v_new_invoice_id,
      'new_invoice_number', v_new_invoice_number,
      'credit_generated', v_credit_generated,
      'credit_applied', v_apply_credit,
      'additional_payment', v_additional_payment,
      'remaining_credit', v_phone_balance
    )
  );

  return query
  select
    v_exchange_id,
    v_return_id,
    v_return_number,
    v_new_invoice_id,
    v_new_invoice_number,
    v_credit_generated,
    v_apply_credit,
    v_additional_payment,
    v_phone_balance;
end;
$$;

grant execute on function public.create_manual_invoice_exchange_transaction(uuid, uuid, jsonb, jsonb, text, numeric, text, text, text, text, numeric) to authenticated;
