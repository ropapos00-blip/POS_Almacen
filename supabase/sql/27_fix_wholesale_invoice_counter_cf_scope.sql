-- 27_fix_wholesale_invoice_counter_cf_scope.sql
-- Corrige el consecutivo de confeccion para que SOLO tome facturas CF-<numero>.
-- Con esto, si no existe ninguna CF previa en la tienda, inicia en CF-0001.
-- Mantiene crecimiento sin limite: CF-9999 -> CF-10000.

create or replace function public.next_wholesale_invoice_number(p_store_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_width integer;
begin
  if p_store_id is null then
    raise exception 'store_id es obligatorio para generar consecutivo.';
  end if;

  -- Lock por tienda para evitar colisiones en concurrencia.
  perform pg_advisory_xact_lock(hashtextextended('wholesale-invoice:' || p_store_id::text, 0));

  select coalesce(max((substring(i.invoice_number from '^CF-([0-9]+)$'))::bigint), 0) + 1
    into v_next
  from public.wholesale_invoices i
  where i.store_id = p_store_id
    and i.invoice_number is not null
    and i.invoice_number ~ '^CF-[0-9]+$';

  v_width := greatest(4, length(v_next::text));

  return 'CF-' || lpad(v_next::text, v_width, '0');
end;
$$;

grant execute on function public.next_wholesale_invoice_number(uuid) to authenticated;
