-- 26_wholesale_invoice_consecutive_format.sql
-- Ajusta consecutivo de facturas de confeccion:
-- - Inicio en CF-0001
-- - Incremental por tienda
-- - Sin limite de 4 digitos (despues de 9999 sigue 10000)
-- - Con lock transaccional por tienda para evitar colisiones en concurrencia

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

  -- Bloquea por tienda dentro de la transaccion actual para evitar duplicados concurrentes.
  perform pg_advisory_xact_lock(hashtextextended('wholesale-invoice:' || p_store_id::text, 0));

  select coalesce(max((substring(i.invoice_number from '([0-9]+)$'))::bigint), 0) + 1
    into v_next
  from public.wholesale_invoices i
  where i.store_id = p_store_id
    and i.invoice_number is not null
    and substring(i.invoice_number from '([0-9]+)$') is not null;

  v_width := greatest(4, length(v_next::text));

  return 'CF-' || lpad(v_next::text, v_width, '0');
end;
$$;

grant execute on function public.next_wholesale_invoice_number(uuid) to authenticated;
