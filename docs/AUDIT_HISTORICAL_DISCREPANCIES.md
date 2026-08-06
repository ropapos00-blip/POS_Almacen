# Auditoría Histórica: Identificar Discrepancias en Sesiones Existentes

Este documento contiene queries SQL para auditar sesiones de caja existentes y encontrar problemas que **ya están en los datos** (antes de desplegar las nuevas validaciones).

## 🔍 Queries de Auditoría

### 1. Sesiones Multi-Día (Mayor Riesgo)

Las sesiones que abarcan múltiples días calendario son más propensas a errores de cálculo porque los gastos cambian día a día pero se suman todos.

```sql
select 
  s.id,
  s.session_date,
  s.created_at,
  s.closed_at,
  s.status,
  s.cash_base,
  s.cash_counted,
  (s.closed_at::date - s.created_at::date) as days_span,
  s.store_id,
  u.email as closed_by_email
from public.cash_register_sessions s
left join public.profiles u on s.closed_by = u.id
where s.status = 'closed'
  and (s.closed_at::date - s.created_at::date) > 0
  and s.created_at > now() - interval '90 days'
order by s.created_at desc;
```

**Interpretación:** Si ves sesiones con `days_span > 0`, esas son candidatas para auditar manualmente porque los gastos podrían no estar correctamente asignados.

---

### 2. Gastos Duplicados Potenciales

Detecta gastos con la misma cantidad, fecha y usuario creador en el mismo día. Esto indica posibles doble-clicks o errores de reintento.

```sql
with expense_duplicates as (
  select
    amount,
    expense_date,
    created_by,
    count(*) as duplicate_count,
    array_agg(id) as ids,
    array_agg(created_at order by created_at) as created_times
  from public.manual_invoice_expenses
  where is_active = true
    and expense_date >= (current_date - interval '90 days')
  group by amount, expense_date, created_by
  having count(*) > 1
)
select
  e.*,
  s.name as store_name
from expense_duplicates e
join public.manual_invoice_expenses mie on e.ids[1] = mie.id
join public.stores s on mie.store_id = s.id
order by e.expense_date desc, e.amount desc;
```

**Interpretación:** Cada fila es un grupo de gastos idénticos. Si `duplicate_count > 2`, probablemente sea un error humano.

---

### 3. Discrepancia Sesión vs Datos Reales

Compara cash_base + cash_counted con los datos reales de ventas/gastos. Nota: Esto no es perfectamente preciso sin el RPC nuevo, pero da una aproximación.

```sql
with session_data as (
  select
    s.id as session_id,
    s.session_date,
    s.cash_base,
    s.cash_counted,
    (s.cash_counted - s.cash_base) as reported_movement,
    coalesce(
      (select sum(grand_total) from public.sales
       where store_id = s.store_id
         and status = 'confirmed'
         and created_at::date = s.session_date),
      0
    ) as total_sales,
    coalesce(
      (select sum(amount) from public.manual_invoice_expenses
       where store_id = s.store_id
         and is_active = true
         and expense_date = s.session_date),
      0
    ) as total_expenses
  from public.cash_register_sessions s
  where s.status = 'closed'
    and s.created_at > now() - interval '60 days'
)
select
  session_id,
  session_date,
  cash_base,
  cash_counted,
  reported_movement,
  total_sales,
  total_expenses,
  (cash_base + reported_movement) as calculated_end,
  ((total_sales - total_expenses) - reported_movement) as potential_discrepancy
from session_data
where abs((total_sales - total_expenses) - reported_movement) > 1000  -- > $1k difference
order by potential_discrepancy desc;
```

**Interpretación:** `potential_discrepancy` muestra cuánto se desvía el efectivo reportado del efectivo que debería haber según ventas-gastos.

---

### 4. Sesiones Sin Cierre Correcto

Sesiones que fueron "cerradas" pero sin que se haya grabado cash_counted (puede indicar cierre incompleto).

```sql
select
  s.id,
  s.session_date,
  s.status,
  s.cash_base,
  s.cash_counted,
  s.closed_at,
  s.notes_close,
  u.email as opened_by,
  u2.email as closed_by,
  age(s.closed_at, s.created_at) as session_duration
from public.cash_register_sessions s
left join public.profiles u on s.opened_by = u.id
left join public.profiles u2 on s.closed_by = u2.id
where s.status = 'closed'
  and (s.cash_counted is null or s.cash_counted = 0)
  and s.created_at > now() - interval '90 days'
order by s.created_at desc;
```

**Interpretación:** Estas sesiones se cerraron sin registrar efectivo contado, lo cual es anómalo.

---

### 5. Transacciones Sospechosas por Método de Pago

Identifica pagos mixtos donde el parsing podría haber fallado (NULL payment_reference).

```sql
select
  mi.id,
  mi.invoice_number,
  mi.grand_total,
  mi.payment_method,
  mi.payment_reference,
  mi.created_at,
  s.name as store_name,
  p.email as created_by
from public.manual_invoices mi
join public.stores s on mi.store_id = s.id
left join public.profiles p on mi.created_by = p.id
where mi.payment_method = 'mixed'
  and (mi.payment_reference is null or trim(mi.payment_reference) = '')
  and mi.is_active = true
  and mi.created_at > now() - interval '60 days'
order by mi.created_at desc;
```

**Interpretación:** Cada fila es una factura que dice "pagada mixta" pero no tiene desglose de método/monto. Esto causaría que en getDaySalesSummary() se ignoren estos pagos.

---

### 6. Ventas con Discrepancia Monto

Ventas donde grand_total ≠ sum(sale_payments). Esto afecta directamente al expectedCash.

```sql
with payment_sums as (
  select
    s.id as sale_id,
    s.grand_total,
    coalesce(sum(sp.amount), 0) as payment_sum,
    abs(coalesce(sum(sp.amount), 0) - s.grand_total) as difference
  from public.sales s
  left join public.sale_payments sp on s.id = sp.sale_id
  where s.status = 'confirmed'
    and s.created_at > now() - interval '60 days'
  group by s.id, s.grand_total
  having abs(coalesce(sum(sp.amount), 0) - s.grand_total) > 0.01  -- > $0.01 tolerance
)
select
  ps.sale_id,
  ps.grand_total,
  ps.payment_sum,
  ps.difference,
  s.sold_at,
  st.name as store_name,
  p.email as sold_by
from payment_sums ps
join public.sales s on ps.sale_id = s.id
join public.stores st on s.store_id = st.id
left join public.profiles p on s.sold_by = p.id
order by ps.difference desc
limit 50;
```

**Interpretación:** Cada fila es una venta con discrepancia entre lo vendido y lo pagado. Esto causa que expectedCash sea incorrecto.

---

### 7. Gastos con Monto Cero (Probables Errores)

```sql
select
  id,
  expense_date,
  amount,
  notes,
  created_at,
  created_by,
  s.name as store_name
from public.manual_invoice_expenses mie
join public.stores s on mie.store_id = s.id
where is_active = true
  and amount <= 0
  and expense_date >= (current_date - interval '60 days')
order by expense_date desc;
```

**Interpretación:** Gastos con monto 0 o negativo son errores de entrada.

---

### 8. Patrón: Cambios Extremos de Efectivo

Sesiones donde el efectivo contado es muy diferente del esperado (indicador de error sistémico).

```sql
with session_calcs as (
  select
    s.id,
    s.session_date,
    s.cash_base,
    s.cash_counted,
    (s.cash_counted - s.cash_base) as net_movement,
    s.closed_at,
    s.store_id,
    case
      when s.cash_counted > s.cash_base * 1.5 then 'HIGH_OVERAGE'
      when s.cash_counted < s.cash_base * 0.5 then 'HIGH_SHORTAGE'
      when abs(s.cash_counted - s.cash_base) > 100000 then 'EXTREME_VARIANCE'
      else 'NORMAL'
    end as pattern
  from public.cash_register_sessions s
  where s.status = 'closed'
    and s.created_at > now() - interval '60 days'
)
select
  *
from session_calcs
where pattern != 'NORMAL'
order by session_date desc;
```

**Interpretación:** Cambios extremos pueden indicar errores en la lógica de cálculo (ej: descuento duplicado, gasto sumado dos veces).

---

## 📊 Script de Auditoría Integral

Ejecuta este script para obtener un reporte consolidado de problemas:

```sql
with issues as (
  select 'MULTI_DAY_SESSION' as issue_type, count(*) as count
  from public.cash_register_sessions
  where (closed_at::date - created_at::date) > 0
    and status = 'closed'
    and created_at > now() - interval '90 days'
  
  union all
  
  select 'DUPLICATE_EXPENSES', count(*)
  from (
    select 1
    from public.manual_invoice_expenses
    where is_active = true
    group by amount, expense_date, created_by
    having count(*) > 1
  ) _
  
  union all
  
  select 'NULL_MIXED_PAYMENTS', count(*)
  from public.manual_invoices
  where payment_method = 'mixed'
    and (payment_reference is null or trim(payment_reference) = '')
    and is_active = true
    and created_at > now() - interval '60 days'
  
  union all
  
  select 'SALE_PAYMENT_MISMATCH', count(*)
  from public.sales s
  where status = 'confirmed'
    and abs(s.grand_total - coalesce((
      select sum(amount)
      from public.sale_payments
      where sale_id = s.id
    ), 0)) > 0.01
    and created_at > now() - interval '60 days'
  
  union all
  
  select 'ZERO_EXPENSES', count(*)
  from public.manual_invoice_expenses
  where is_active = true
    and amount <= 0
    and expense_date >= current_date - interval '60 days'
)
select
  issue_type,
  count as affected_records
from issues
order by affected_records desc;
```

---

## 🎯 Recomendaciones por Hallazgo

| Hallazgo | Acción |
|----------|--------|
| MULTI_DAY_SESSION > 5 | Revisar sesiones, puede indicar que no se cierran a diario (operacional, no código) |
| DUPLICATE_EXPENSES > 10 | Investigar proceso de entrada de gastos; probablemente doble-clicks |
| NULL_MIXED_PAYMENTS > 0 | 🚨 Crítico - estas facturas están siendo ignoradas en cierre. Necesita corrección manual de cada una |
| SALE_PAYMENT_MISMATCH > 50 | 🚨 Crítico - Esto es exactamente el problema detectado en los 5 root causes. Investigar RPC de venta |
| ZERO_EXPENSES > 0 | Borrar estos registros, son errores de entrada |

---

## 📋 Checklist Pre-Deploy

Ejecuta esta auditoría **antes** de desplegar el código nuevo:

- [ ] Ejecutar Query #5 (NULL_MIXED_PAYMENTS) → Si count > 0, crear ticket para cada una
- [ ] Ejecutar Query #6 (SALE_PAYMENT_MISMATCH) → Si count > 50, escalate to dev
- [ ] Ejecutar Query #7 (ZERO_EXPENSES) → Si count > 0, borrar registros
- [ ] Ejecutar Query #2 (DUPLICATES) → Si count > 10, auditor debe revisar
- [ ] Ejecutar Integral Script → Revisa todos los temas juntos
- [ ] Generar reporte para operaciones
- [ ] Comunicar hallazgos a equipo
- [ ] Proceder con deploy

---

## 🔄 Acciones Correctivas

### Para NULL_MIXED_PAYMENTS:

```sql
-- Revisar qué facturas están afectadas
select * from public.manual_invoices
where payment_method = 'mixed'
  and (payment_reference is null or trim(payment_reference) = '')
  and is_active = true
limit 20;

-- Pasos manuales:
-- 1. Revisar en app cuál fue el método de pago real
-- 2. Actualizar payment_reference = 'metodo1:monto1:metodo2:monto2'
-- 3. Verificar que suma de montos = grand_total
```

### Para DUPLICATE_EXPENSES:

```sql
-- Revisar duplicados
select 
  amount,
  expense_date,
  created_by,
  array_agg(id) as ids,
  count(*) as count
from public.manual_invoice_expenses
where is_active = true
  and amount in (
    select amount from public.manual_invoice_expenses
    group by amount, expense_date, created_by
    having count(*) > 1
  )
group by amount, expense_date, created_by
order by expense_date desc;

-- Marcar como inactivo (soft delete)
update public.manual_invoice_expenses
set is_active = false
where id in (...)  -- Ids duplicadas, mantener solo 1 activa
and created_at > (
  select min(created_at)
  from public.manual_invoice_expenses
  group by amount, expense_date, created_by
);
```

---

**Documento creado:** 2025-01-XX  
**Uso:** Antes de desplegar 54_validate_cash_register_close.sql  
**Impacto:** Zero - Solo SELECT queries, sin modificaciones de datos
