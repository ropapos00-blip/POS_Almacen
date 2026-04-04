-- 05_sale_void_rpc.sql
-- Anular venta con reversa de inventario y auditoria

create or replace function public.void_sale_transaction(
  p_sale_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns table (sale_id uuid, sale_status text)
language plpgsql
security invoker
as $$
declare
  v_sale record;
  v_item record;
  v_reason text;
begin
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Motivo de anulacion requerido.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Sin permisos para anular venta.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if not (v_sale.store_id in (select public.current_user_store_ids())) then
    raise exception 'Sin acceso a la tienda de esta venta.';
  end if;

  if v_sale.status = 'void' then
    raise exception 'La venta ya esta anulada.';
  end if;

  for v_item in
    select si.variant_id, si.quantity
    from public.sale_items si
    where si.sale_id = p_sale_id
  loop
    update public.inventory_stock
    set quantity_on_hand = quantity_on_hand + v_item.quantity,
        updated_at = now()
    where store_id = v_sale.store_id
      and variant_id = v_item.variant_id;

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
      v_sale.store_id,
      v_item.variant_id,
      'return',
      v_item.quantity,
      concat('Anulacion venta: ', v_reason),
      'sale_void',
      p_sale_id,
      p_actor_user_id
    );
  end loop;

  update public.sales
  set status = 'void'
  where id = p_sale_id;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    v_sale.store_id,
    p_actor_user_id,
    'sale_voided',
    'sales',
    p_sale_id,
    jsonb_build_object('reason', v_reason)
  );

  return query select p_sale_id, 'void'::text;
end;
$$;
