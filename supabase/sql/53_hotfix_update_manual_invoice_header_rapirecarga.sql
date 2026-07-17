-- 53_hotfix_update_manual_invoice_header_rapirecarga.sql
-- BUG REPORTADO: al editar una factura manual y elegir "Rapirecarga" (o cualquier
-- metodo agregado despues del lanzamiento inicial), el guardado fallaba con:
--   POST .../rpc/update_manual_invoice_header  400 (Bad Request)
--
-- DIAGNOSTICO:
-- La funcion public.update_manual_invoice_header fue creada en 13_manual_invoice_admin_actions.sql
-- con una lista de metodos de pago antigua: solo ('cash','card','transfer','mixed').
-- La migracion 30_fix_rpc_payment_methods.sql SI corrige esta funcion (agrega
-- addi/credilondon/dataphone/bancolombia/daviplata/nequi/rapirecarga), pero esa
-- migracion tambien redefine create_manual_invoice_transaction en el mismo archivo;
-- todo indica que en produccion solo se aplico el hotfix de
-- 49_hotfix_restore_manual_invoice_rpc_prod.sql (que arregla create_manual_invoice_transaction)
-- y NUNCA se volvio a ejecutar el bloque de update_manual_invoice_header de la
-- migracion 30. Por eso "crear" factura con Rapirecarga funciona pero "editar"
-- (Editor factura manual) seguia usando la lista vieja y rechazaba el guardado
-- con 'Metodo de pago invalido.' -> Postgres exception -> 400 en PostgREST.
--
-- FIX: reaplica UNICAMENTE update_manual_invoice_header (create or replace,
-- misma firma de siempre) con la lista de metodos completa. No toca
-- create_manual_invoice_transaction, constraints de tabla, ni ninguna otra
-- funcion, para no descuadrar nada que ya este funcionando.

drop function if exists public.update_manual_invoice_header(uuid, uuid, text, text, text, text);

create or replace function public.update_manual_invoice_header(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_payment_reference text default null
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.manual_invoices%rowtype;
  v_payment_reference text;
begin
  select *
  into v_invoice
  from public.manual_invoices
  where id = p_invoice_id
    and is_active = true;

  if not found then
    raise exception 'Factura manual no encontrada o ya anulada.';
  end if;

  if not (v_invoice.store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda de esta factura manual.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin o super admin pueden editar facturas manuales.';
  end if;

  if p_payment_method not in (
    'cash', 'addi', 'credilondon', 'dataphone',
    'bancolombia', 'daviplata', 'nequi', 'rapirecarga', 'mixed'
  ) then
    raise exception 'Metodo de pago invalido.';
  end if;

  -- Preserve payment_reference for any method except cash
  -- (mixed uses it to store the encoded "method1:amt1:method2:amt2" breakdown)
  if p_payment_method = 'cash' then
    v_payment_reference := null;
  else
    v_payment_reference := nullif(trim(coalesce(p_payment_reference, '')), '');
  end if;

  update public.manual_invoices
  set
    customer_name = nullif(trim(coalesce(p_customer_name, '')), ''),
    customer_phone = nullif(trim(coalesce(p_customer_phone, '')), ''),
    payment_method = p_payment_method,
    payment_reference = v_payment_reference
  where id = p_invoice_id
    and is_active = true;

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
    'manual_invoice_updated',
    'manual_invoices',
    p_invoice_id,
    jsonb_build_object(
      'customer_name', nullif(trim(coalesce(p_customer_name, '')), ''),
      'customer_phone', nullif(trim(coalesce(p_customer_phone, '')), ''),
      'payment_method', p_payment_method,
      'payment_reference', v_payment_reference
    )
  );

  return query
  select v_invoice.id, v_invoice.invoice_number;
end;
$$;

grant execute on function public.update_manual_invoice_header(uuid, uuid, text, text, text, text) to authenticated;
