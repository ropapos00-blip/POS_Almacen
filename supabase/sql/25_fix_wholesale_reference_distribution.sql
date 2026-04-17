-- 25_fix_wholesale_reference_distribution.sql
-- Repara distribucion por talla/color para referencias de confeccion.
-- Objetivo: que quantity_on_hand pueda facturarse cuando UI vende por referencia.

-- 1) Si existe matriz por color/talla, recalcula size_quantities y quantity_on_hand desde esa matriz.
with color_size_totals as (
  select
    wr.id,
    coalesce(
      jsonb_object_agg(size_rows.size_key, to_jsonb(size_rows.total_qty))
        filter (where size_rows.size_key is not null and btrim(size_rows.size_key) <> ''),
      '{}'::jsonb
    ) as rebuilt_size_quantities,
    coalesce(sum(size_rows.total_qty), 0) as rebuilt_total
  from public.wholesale_references wr
  left join lateral (
    select
      size_entry.key as size_key,
      sum((size_entry.value)::integer) as total_qty
    from jsonb_each(coalesce(wr.color_quantities, '{}'::jsonb)) as color_entry
    cross join lateral jsonb_each_text(
      case
        when jsonb_typeof(color_entry.value) = 'object' then color_entry.value
        else '{}'::jsonb
      end
    ) as size_entry
    where size_entry.key is not null
      and btrim(size_entry.key) <> ''
    group by size_entry.key
  ) as size_rows on true
  group by wr.id
)
update public.wholesale_references wr
set
  size_quantities = cst.rebuilt_size_quantities,
  quantity_on_hand = cst.rebuilt_total,
  updated_at = now()
from color_size_totals cst
where wr.id = cst.id
  and cst.rebuilt_size_quantities <> '{}'::jsonb;

-- 2) Si no hay desglose por talla/color pero quantity_on_hand > 0,
--    crea bucket generico UNICO/UNICA para permitir facturacion por referencia.
update public.wholesale_references
set
  size_quantities = jsonb_build_object('UNICA', greatest(coalesce(quantity_on_hand, 0), 0)),
  color_quantities = jsonb_build_object(
    'UNICO',
    jsonb_build_object('UNICA', greatest(coalesce(quantity_on_hand, 0), 0))
  ),
  updated_at = now()
where greatest(coalesce(quantity_on_hand, 0), 0) > 0
  and (
    coalesce(size_quantities, '{}'::jsonb) = '{}'::jsonb
    or coalesce(color_quantities, '{}'::jsonb) = '{}'::jsonb
  );

-- 3) Para referencias en cero, deja json vacio consistente.
update public.wholesale_references
set
  size_quantities = '{}'::jsonb,
  color_quantities = '{}'::jsonb,
  updated_at = now()
where greatest(coalesce(quantity_on_hand, 0), 0) = 0
  and (
    coalesce(size_quantities, '{}'::jsonb) <> '{}'::jsonb
    or coalesce(color_quantities, '{}'::jsonb) <> '{}'::jsonb
  );
