-- 40_delete_layaway_rpc.sql
-- Marcar separado como archivado (eliminación lógica, no física)
-- SEGURO: No borra datos, solo los marca para ocultar de UI
-- Los datos permanecen en BD para auditoría y recuperación

create or replace function public.archive_layaway(
  p_layaway_id uuid
)
returns table (
  layaway_id uuid,
  archived_at timestamp with time zone,
  success boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layaway record;
begin
  -- Validar permisos: solo admin/super_admin
  if not (
    auth.uid() is not null
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('admin')
    )
  ) then
    raise exception 'Sin permisos para archivar separados.';
  end if;

  -- Obtener el separado (con candado para evitar race conditions)
  select *
  into v_layaway
  from public.layaways
  where id = p_layaway_id
  for update;

  if not found then
    raise exception 'Separado no encontrado: %', p_layaway_id;
  end if;

  -- Verificar que pertenece a la tienda del usuario
  if not (v_layaway.store_id in (select public.current_user_store_ids())) then
    raise exception 'Sin acceso a la tienda de este separado.';
  end if;

  -- Solo archivar si NO está activo (ya pago/vencido/cancelado)
  if v_layaway.status = 'active' then
    raise exception 'No se pueden archivar separados activos. Cancela primero.';
  end if;

  -- Marcar como archivado (eliminación lógica, no física)
  update public.layaways
  set 
    is_archived = true,
    archived_at = now(),
    archived_by = auth.uid()
  where id = p_layaway_id;

  -- Registrar en auditoría
  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_before
  )
  values (
    v_layaway.store_id,
    auth.uid(),
    'layaway_archived',
    'layaways',
    p_layaway_id,
    jsonb_build_object(
      'customer_name', v_layaway.customer_name,
      'total_amount', v_layaway.total_amount,
      'paid_amount', v_layaway.paid_amount,
      'status', v_layaway.status,
      'message', 'Archivado para liberar espacio en UI (datos preservados en BD)'
    )
  );

  -- Retornar info de la operación
  return query
  select
    p_layaway_id as layaway_id,
    now() as archived_at,
    true as success;

  exception when others then
    raise exception 'Error archivando separado: %', sqlerrm;
end;
$$;
