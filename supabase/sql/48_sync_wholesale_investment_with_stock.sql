-- 48_sync_wholesale_investment_with_stock.sql
-- Mantiene consistente la inversion cuando solo cambia el stock en ventas/ediciones.
-- Usa cost_breakdown_unit como fuente estable para recalcular totales por cantidad.

drop trigger if exists trg_sync_wholesale_investment_with_stock on public.wholesale_references;
drop function if exists public.sync_wholesale_investment_with_stock();

create or replace function public.sync_wholesale_investment_with_stock()
returns trigger
language plpgsql
as $$
declare
  v_old_qty numeric := coalesce(old.quantity_on_hand, 0);
  v_new_qty numeric := greatest(0, coalesce(new.quantity_on_hand, 0));
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if v_old_qty = v_new_qty then
    return new;
  end if;

  -- Si la actualización ya trae montos nuevos de inversión/costos, respetar esos valores.
  if new.total_investment is distinct from old.total_investment
     or coalesce(new.cost_breakdown, '{}'::jsonb) is distinct from coalesce(old.cost_breakdown, '{}'::jsonb) then
    return new;
  end if;

  if v_old_qty <= 0 then
    return new;
  end if;

  -- Recalcular desde el unitario estable.
  new.cost_breakdown := coalesce(
    (
      select jsonb_object_agg(
        key,
        to_jsonb(round(coalesce(value::numeric, 0) * v_new_qty, 2))
      )
      from jsonb_each_text(
        coalesce(
          nullif(new.cost_breakdown_unit, '{}'::jsonb),
          nullif(old.cost_breakdown_unit, '{}'::jsonb),
          old.cost_breakdown,
          '{}'::jsonb
        )
      )
    ),
    '{}'::jsonb
  );

  new.total_investment := coalesce(
    (
      select round(sum(coalesce(value::numeric, 0)), 2)
      from jsonb_each_text(coalesce(new.cost_breakdown, '{}'::jsonb))
    ),
    0
  );

  return new;
end;
$$;

create trigger trg_sync_wholesale_investment_with_stock
before update on public.wholesale_references
for each row
execute function public.sync_wholesale_investment_with_stock();
