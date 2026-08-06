# Solución Completa: Discrepancias de Efectivo en Cierre de Caja

## 📋 Resumen Ejecutivo

Se identificaron **5 problemas raíz** que causaban discrepancias entre el efectivo esperado y el contado. Se creó una solución integral de **3 capas**: validaciones SQL, RPC transaccional, y UI mejorada con auditoría.

**Impacto:**
- ✅ Detecta automáticamente inconsistencias en cálculos
- ✅ Registra discrepancias para auditoría
- ✅ Permite cierre seguro incluso con diferencias
- ✅ No rompe datos existentes (solo valida)

---

## 🔧 Problemas Identificados

| # | Problema | Ubicación | Severidad | Solución |
|---|----------|-----------|-----------|----------|
| 1 | Descuento en line_total de sale_items | `04_pos_sale_rpc.sql:220` | Baja | Corregir cálculo en INSERT |
| 2 | Sin validación en getDaySalesSummary() | `cashRegisterService.ts:170` | Alta | Agregar validateDaySalesSummary() |
| 3 | Parsing frágil de mixed payments | `cashRegisterService.ts:256-272` | Alta | Validación robusta con error handling |
| 4 | Gastos duplicados no detectados | `cashRegisterService.ts:223` | Media | detect_duplicate_expenses() SQL |
| 5 | Sin validación en RPC closeSession() | `cashRegisterService.ts` | Crítica | close_cash_register_transactional() |

---

## 📦 Cambios Realizados

### 1. SQL Migrations

#### `54_validate_cash_register_close.sql` - Funciones de Validación
- **6 funciones nuevas:**
  1. `validate_sale_payments()` - Verifica que sale_payments.sum = sales.grand_total
  2. `validate_manual_invoice_payments()` - Valida desglose de pagos mixtos
  3. `detect_duplicate_expenses()` - Identifica gastos duplicados por cantidad/fecha
  4. `validate_cash_register_summary()` - Resumen diario de validaciones
  5. `record_cash_register_validation()` - Audita resultados de validación
  6. Tabla `cash_register_validations` con RLS y audit trail

**Seguridad:** Todas las funciones tienen RLS + grant a authenticated

#### `55_close_cash_register_transactional.sql` - RPC y Tabla de Discrepancias
- **Tabla `cash_register_discrepancies`:**
  - Registra cada cierre con expected/counted/difference
  - Clasifica por tipo: shortage vs overage
  - Severidad: minor, warning, critical
  - Permite resolución manual (resolved, resolution_notes)
  - Índices para queries rápidas

- **RPC `calculate_expected_cash_detailed()`:**
  - Calcula efectivo esperado en backend (no confiable en cliente)
  - Desglose completo: POS cash/card/transfer + invoices + layaways + expenses
  - Maneja pagos mixtos con parsing robusto
  - Retorna jsonb con todos los detalles

- **RPC `close_cash_register_transactional()`:**
  - Cierra sesión con validaciones transaccionales
  - Detecta discrepancias automáticamente
  - Registra en `cash_register_discrepancies`
  - Permite cierre incluso con diferencias < tolerancia (default $1k)
  - Audita en `audit_logs` con cálculo completo

### 2. TypeScript Service Updates

#### `cashRegisterService.ts` - Funciones Nuevas

**`validateDaySalesSummary(summary): ValidationResult`**
- Valida que sum(byMethod) = total para cada categoría
- Retorna errors[] + warnings[] (no lanza excepciones)
- Uso: UI puede alertar sin bloquear

**`closeSessionTransactional(input): Promise<CloseResult>`**
- Llama al nuevo RPC en lugar de UPDATE directo
- Retorna: sessionId, closed, expectedCash, difference, discrepancyId, message
- Permite auditoría bidireccional cliente↔servidor

### 3. React Component Updates

#### `CierresCajaPage.tsx` - Validación y Input

**Estado nuevo:**
```typescript
const [validationWarnings, setValidationWarnings] = useState<string[]>([])
const [cashCountedInput, setCashCountedInput] = useState('')
```

**Effect nuevo:**
```typescript
useEffect(() => {
  if (summary) {
    const validation = validateDaySalesSummary(summary)
    setValidationWarnings([...validation.errors, ...validation.warnings])
  }
}, [summary])
```

**Función actualizada `handleCloseSession()`:**
- Valida consistencia antes de cerrar
- Pide confirmación si hay warnings
- Permite ingresar efectivo contado real
- Usa RPC transaccional
- Muestra mensaje con discrepancia detectada

---

## 🚀 Instrucciones de Despliegue

### Fase 1: Preparación (Sin Cambios a Datos)

1. **Crear migraciones SQL** en `supabase/sql/`:
   ```bash
   # Ya creados:
   supabase/sql/54_validate_cash_register_close.sql
   supabase/sql/55_close_cash_register_transactional.sql
   ```

2. **Ejecutar migraciones en staging:**
   ```bash
   # Verificar la estructura:
   supabase db push --dry-run
   
   # Aplicar cambios:
   supabase db push
   ```

3. **Validar en Supabase Studio:**
   - Verificar que existen las 6 funciones en Functions
   - Verificar tabla `cash_register_discrepancies` 
   - Verificar índices fueron creados
   - Ejecutar test manual:
     ```sql
     select * from validate_sale_payments('test-sale-id'::uuid);
     ```

### Fase 2: Despliegue Frontend

1. **Actualizar dependencias (si es necesario):**
   ```bash
   pnpm install
   ```

2. **Cambios en archivos:**
   - `src/features/cash-register/services/cashRegisterService.ts` ✅ Actualizado
   - `src/features/cash-register/ui/CierresCajaPage.tsx` ✅ Actualizado

3. **Compilar y validar:**
   ```bash
   pnpm run build
   ```

4. **Deploy (normalmente via Render):**
   ```bash
   # En staging primero:
   git push staging main
   # Verificar build en Render
   
   # Luego a producción:
   git push origin main
   ```

### Fase 3: Testing en Staging

**Script de validación:**
```sql
-- 1. Verificar function con datos reales
select * from validate_cash_register_summary(
  'store-id'::uuid, 
  '2025-01-15'::date
);

-- 2. Simular cierre transaccional
select * from close_cash_register_transactional(
  'session-id'::uuid,
  'user-id'::uuid,
  50000.00,  -- cashCounted
  'test close'::text,
  '2025-01-15'::date
);

-- 3. Verificar que se registró discrepancia
select * from cash_register_discrepancies
where session_id = 'session-id'::uuid;
```

---

## 📊 Validación y Monitoreo

### KPIs de Éxito

1. **Sin errores en deploy:** Todas las funciones se crean sin conflictos
2. **Consistencia de datos:** 95%+ de cierres sin warnings
3. **Auditoría completa:** 100% de cierres registrados en validations table
4. **Sin regresos:** Cierres previos siguen siendo válidos

### Queries de Monitoreo

**Discrepancias por severidad (últimos 7 días):**
```sql
select 
  severity,
  count(*) as count,
  avg(abs(difference)) as avg_difference,
  max(abs(difference)) as max_difference
from public.cash_register_discrepancies
where created_at >= now() - interval '7 days'
group by severity
order by count desc;
```

**Cierres sin validación (para auditar histórico):**
```sql
select 
  s.id,
  s.session_date,
  s.cash_base,
  s.cash_counted,
  (s.cash_counted - s.cash_base) as simple_diff
from public.cash_register_sessions s
where s.status = 'closed'
  and not exists (
    select 1 from public.cash_register_discrepancies d
    where d.session_id = s.id
  )
order by s.closed_at desc
limit 100;
```

---

## ⚠️ Notas Importantes

### Compatibilidad Hacia Atrás
- ✅ Funciones SQL son **nuevas**, no modifican tablas existentes
- ✅ RPC `closeSessionTransactional()` es nueva, no reemplaza closeSession()
- ⚠️ Frontend usa nueva función, pero puede volver a anterior si falla

### Datos Históricos
- ✅ Tablas existentes (sales, invoices, expenses) no se tocan
- ✅ Cada validación es no-destructiva (solo SELECT)
- ✅ Discrepancias solo se registran en sesiones nuevas

### Tolerancias
- **Tolerancia de cierre:** $1,000 COP (editable en 55_close_cash_register_transactional.sql, línea ~150)
- **Tolerancia de redondeo:** $0.01 COP (en validaciones, línea variable)

---

## 🔍 Rollback Plan

Si hay problemas:

**Opción 1: Revert SQL (en Supabase):**
```sql
-- Eliminar funciones nuevas
drop function if exists public.close_cash_register_transactional cascade;
drop function if exists public.calculate_expected_cash_detailed cascade;
drop function if exists public.detect_duplicate_expenses cascade;
drop function if exists public.validate_cash_register_summary cascade;
drop function if exists public.validate_manual_invoice_payments cascade;
drop function if exists public.validate_sale_payments cascade;

-- Eliminar tabla auditoría
drop table if exists public.cash_register_discrepancies cascade;
drop table if exists public.cash_register_validations cascade;
```

**Opción 2: Revert Frontend:**
- Revert commits a `cashRegisterService.ts` y `CierresCajaPage.tsx`
- Usa closeSession() original sin validaciones

---

## 📝 Checklist de Despliegue

- [ ] Ejecutar migraciones SQL en staging
- [ ] Validar funciones con script de test
- [ ] Actualizar código TypeScript
- [ ] Compilar sin errores (pnpm run build)
- [ ] Testing en staging: abrir y cerrar sesión
- [ ] Verificar registro en discrepancies table
- [ ] Validar UI muestra warnings correctamente
- [ ] QA: Simular efectivo contado ≠ esperado
- [ ] Documentation: Comunicar a operaciones
- [ ] Deploy a producción
- [ ] Monitorear discrepancias por 48h
- [ ] Comunicar métricas de validación

---

## 📞 Support & Questions

**Si hay errores de deploy:**
1. Verificar que Supabase está en versión compatible (PostgreSQL 15+)
2. Verificar que auth.uid() está disponible (debe ser, es estándar)
3. Validar que RLS policies no tienen conflictos (current_user_store_ids debe existir)

**Si hay falsos positivos en validación:**
1. Revisar logs de validación en cash_register_validations
2. Ejecutar query de "Discrepancias por severidad" arriba
3. Ajustar tolerancias según realidad operativa

---

**Documento creado:** 2025-01-XX  
**Versión:** 1.0  
**Estado:** Listo para despliegue a staging
