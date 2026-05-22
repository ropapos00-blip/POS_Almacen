-- 49_repair_wholesale_investment_history.sql
-- Repara inflaciones historicas de inversion en inventario de confeccion.
-- IMPORTANTE:
-- - NO modifica los insumos unitarios (cost_breakdown_unit).
-- - NO reescala cost_breakdown para evitar "mezclar" valores de insumos.
-- - Solo corrige total_investment y reconstruye cost_breakdown desde el unitario estable.

do $$
declare
  v_ref record;
  v_mv record;
  v_run_qty numeric;
  v_run_inv numeric;
  v_out_qty numeric;
  v_avg_unit_inv numeric;
  v_old_total numeric;
  v_new_total numeric;
  v_rebuilt_breakdown jsonb;
begin
  for v_ref in
    select
      wr.id,
      wr.quantity_on_hand,
      wr.total_investment,
      wr.cost_breakdown
    from public.wholesale_references wr
  loop
    v_run_qty := 0;
    v_run_inv := 0;

    for v_mv in
      select
        m.type,
        coalesce(m.quantity, 0)::numeric as qty,
        coalesce(m.investment_amount, 0)::numeric as inv_amount
      from public.wholesale_reference_movements m
      where m.wholesale_reference_id = v_ref.id
      order by m.created_at asc, m.id asc
    loop
      if v_mv.type = 'in' then
        v_run_qty := v_run_qty + greatest(0, v_mv.qty);
        v_run_inv := v_run_inv + greatest(0, v_mv.inv_amount);
      elsif v_mv.type = 'out' then
        if v_run_qty > 0 and v_run_inv > 0 then
          v_out_qty := least(greatest(0, v_mv.qty), v_run_qty);
          v_avg_unit_inv := v_run_inv / nullif(v_run_qty, 0);
          v_run_inv := greatest(0, v_run_inv - (v_out_qty * v_avg_unit_inv));
          v_run_qty := greatest(0, v_run_qty - v_out_qty);
        else
          v_run_qty := greatest(0, v_run_qty - greatest(0, v_mv.qty));
        end if;
      end if;
    end loop;

    v_new_total := round(greatest(0, v_run_inv), 2);

    v_rebuilt_breakdown := coalesce(
      (
        select jsonb_object_agg(
          key,
          to_jsonb(
            round(
              coalesce(value::numeric, 0) * greatest(0, coalesce(v_ref.quantity_on_hand, 0)),
              2
            )
          )
        )
        from jsonb_each_text(coalesce(wr.cost_breakdown_unit, '{}'::jsonb))
      ),
      coalesce(v_ref.cost_breakdown, '{}'::jsonb)
    )
    from public.wholesale_references wr
    where wr.id = v_ref.id;

    update public.wholesale_references wr
    set
      total_investment = v_new_total,
      cost_breakdown = v_rebuilt_breakdown,
      updated_at = now()
    where wr.id = v_ref.id;
  end loop;
end $$;
