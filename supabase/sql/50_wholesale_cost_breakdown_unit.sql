-- 50_wholesale_cost_breakdown_unit.sql
-- Guarda el costo unitario por insumo para que no cambie con el stock.

alter table public.wholesale_references
  add column if not exists cost_breakdown_unit jsonb not null default '{}'::jsonb;

-- Backfill inicial: unitario = total_insumo / quantity_on_hand.
update public.wholesale_references wr
set cost_breakdown_unit = coalesce(
  (
    select jsonb_object_agg(
      key,
      to_jsonb(
        case
          when coalesce(wr.quantity_on_hand, 0) > 0
            then round(coalesce(value::numeric, 0) / wr.quantity_on_hand, 2)
          else 0
        end
      )
    )
    from jsonb_each_text(coalesce(wr.cost_breakdown, '{}'::jsonb))
  ),
  '{}'::jsonb
)
where coalesce(wr.cost_breakdown_unit, '{}'::jsonb) = '{}'::jsonb;
