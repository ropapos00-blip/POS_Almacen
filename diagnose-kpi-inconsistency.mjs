#!/usr/bin/env node

/**
 * SCRIPT DE DIAGNÓSTICO: KPI Inconsistency Detection
 * 
 * ADVERTENCIA: SOLO LECTURA - No modifica la base de datos
 * Objetivo: Identificar por qué los KPIs varían entre cargas
 * 
 * Problemas detectados potenciales:
 * 1. Facturas manuales cambiando de estado entre refreshes
 * 2. Gastos siendo marcados como inactivos
 * 3. Race conditions en queries paralelas
 * 4. RLS policies filtrando datos inconsistentemente
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Leer .env.local
const envPath = path.join(process.cwd(), '.env.local');
let envVars = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const supabaseUrl = envVars.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lick4n42.supabase.co';
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ Error: VITE_SUPABASE_ANON_KEY no configurada');
  console.error('Verifica que .env.local tenga las credenciales de Supabase');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Función auxiliar para formatear moneda COP
 */
function formatCop(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Función auxiliar para mostrar separador
 */
function divider(title) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}\n`);
}

/**
 * DIAGNÓSTICO 1: Facturas Manuales - Estado y Cambios
 */
async function diagnoseManualInvoices(storeId, sessionDate) {
  divider('📋 DIAGNÓSTICO 1: FACTURAS MANUALES');

  const startOfDay = `${sessionDate}T00:00:00Z`;
  const endOfDay = `${sessionDate}T23:59:59Z`;

  console.log(`Tienda: ${storeId}`);
  console.log(`Fecha: ${sessionDate}`);
  console.log(`Rango: ${startOfDay} hasta ${endOfDay}\n`);

  // Query 1: Facturas en estado PROVISIONAL (lo que getDaySalesSummary() ve)
  console.log('🔵 FACTURAS EN ESTADO "PROVISIONAL" (incluidas en cierre):');
  const { data: provisionalInvoices, error: provisionalError } = await supabase
    .from('manual_invoices')
    .select('id, invoice_number, grand_total, source, status, created_at, created_by, notes')
    .eq('store_id', storeId)
    .eq('source', 'provisional')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);

  if (provisionalError) {
    console.error(`❌ Error: ${provisionalError.message}`);
  } else {
    if (provisionalInvoices.length === 0) {
      console.log('  ❌ NINGUNA - El resumen mostraría $0');
    } else {
      console.log(`  ✓ Total: ${provisionalInvoices.length} facturas`);
      const totalProvisional = provisionalInvoices.reduce((sum, inv) => sum + (inv.grand_total || 0), 0);
      console.log(`  ✓ Suma total: ${formatCop(totalProvisional)}`);
      provisionalInvoices.forEach(inv => {
        console.log(`    - [${inv.invoice_number}] ${formatCop(inv.grand_total)} | status: ${inv.status || 'null'} | Creada: ${inv.created_at}`);
      });
    }
  }

  // Query 2: Todas las facturas del día (para ver si hay no-provisionales)
  console.log('\n🟡 TODAS LAS FACTURAS DEL DÍA (cualquier estado):');
  const { data: allInvoices, error: allError } = await supabase
    .from('manual_invoices')
    .select('id, invoice_number, grand_total, source, status, created_at, created_by')
    .eq('store_id', storeId)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);

  if (allError) {
    console.error(`❌ Error: ${allError.message}`);
  } else {
    if (allInvoices.length === 0) {
      console.log('  ❌ NINGUNA');
    } else {
      console.log(`  ✓ Total: ${allInvoices.length} facturas`);
      const bySource = {};
      allInvoices.forEach(inv => {
        const key = `${inv.source || 'null'}/${inv.status || 'null'}`;
        if (!bySource[key]) bySource[key] = [];
        bySource[key].push(inv);
      });
      
      for (const [key, invs] of Object.entries(bySource)) {
        const total = invs.reduce((sum, inv) => sum + (inv.grand_total || 0), 0);
        console.log(`    ${key}: ${invs.length} facturas → ${formatCop(total)}`);
        invs.forEach(inv => {
          const match = invs[0].source === 'provisional' ? ' ✓' : ' ⚠️  (NO INCLUIDA)';
          console.log(`      [${inv.invoice_number}] ${formatCop(inv.grand_total)}${match}`);
        });
      }
    }
  }

  // Query 3: Historial de cambios de estado (si hay audit logs)
  console.log('\n🔍 ÚLTIMOS CAMBIOS (si hay audit logs):');
  const { data: auditLogs, error: auditError } = await supabase
    .from('audit_logs')
    .select('id, table_name, action, changes, created_at')
    .eq('table_name', 'manual_invoices')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .order('created_at', { ascending: false })
    .limit(10);

  if (auditError) {
    console.log(`  (No disponible: ${auditError.message})`);
  } else if (!auditLogs || auditLogs.length === 0) {
    console.log('  (No hay cambios registrados)');
  } else {
    auditLogs.forEach(log => {
      console.log(`    [${log.created_at}] ${log.action}: ${JSON.stringify(log.changes)}`);
    });
  }
}

/**
 * DIAGNÓSTICO 2: Gastos - Estado Activo/Inactivo
 */
async function diagnoseExpenses(storeId, sessionDate) {
  divider('💰 DIAGNÓSTICO 2: GASTOS');

  console.log(`Tienda: ${storeId}`);
  console.log(`Fecha: ${sessionDate}\n`);

  // Query 1: Gastos ACTIVOS (incluidos en cierre)
  console.log('🔵 GASTOS ACTIVOS (incluidos en cierre):');
  const { data: activeExpenses, error: activeError } = await supabase
    .from('manual_invoice_expenses')
    .select('id, amount, expense_date, description, is_active, created_at, created_by')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .eq('expense_date', sessionDate);

  if (activeError) {
    console.error(`❌ Error: ${activeError.message}`);
  } else {
    if (activeExpenses.length === 0) {
      console.log('  ❌ NINGUNO');
    } else {
      const total = activeExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
      console.log(`  ✓ Total: ${activeExpenses.length} gastos → ${formatCop(total)}`);
      activeExpenses.forEach(exp => {
        console.log(`    - ${formatCop(exp.amount)} | ${exp.description || '(sin descripción)'} | ${exp.created_at}`);
      });
    }
  }

  // Query 2: Gastos INACTIVOS (excluidos, pero pueden indicar soft-delete)
  console.log('\n🟡 GASTOS INACTIVOS (soft-deleted, NO incluidos):');
  const { data: inactiveExpenses, error: inactiveError } = await supabase
    .from('manual_invoice_expenses')
    .select('id, amount, expense_date, description, is_active, created_at, created_by')
    .eq('store_id', storeId)
    .eq('is_active', false)
    .eq('expense_date', sessionDate);

  if (inactiveError) {
    console.error(`❌ Error: ${inactiveError.message}`);
  } else {
    if (inactiveExpenses.length === 0) {
      console.log('  (Ninguno)');
    } else {
      const total = inactiveExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
      console.log(`  ⚠️  Total: ${inactiveExpenses.length} gastos ocultos → ${formatCop(total)}`);
      inactiveExpenses.forEach(exp => {
        console.log(`    - ${formatCop(exp.amount)} | ${exp.description || '(sin descripción)'} | Creado: ${exp.created_at}`);
      });
    }
  }
}

/**
 * DIAGNÓSTICO 3: Cierre de Caja - Sesiones y su estado
 */
async function diagnoseCashRegisterSessions(storeId, sessionDate) {
  divider('🏪 DIAGNÓSTICO 3: SESIONES DE CAJA');

  console.log(`Tienda: ${storeId}`);
  console.log(`Fecha: ${sessionDate}\n`);

  // Query 1: Sesiones ABIERTAS del día
  console.log('🟢 SESIONES ABIERTAS (status=open):');
  const { data: openSessions, error: openError } = await supabase
    .from('cash_register_sessions')
    .select('id, session_date, status, cash_base, cash_counted, opened_by, closed_by, created_at, closed_at')
    .eq('store_id', storeId)
    .eq('status', 'open')
    .gte('session_date', sessionDate);

  if (openError) {
    console.error(`❌ Error: ${openError.message}`);
  } else {
    if (openSessions.length === 0) {
      console.log('  ❌ NINGUNA');
    } else {
      console.log(`  ✓ Total: ${openSessions.length} sesión(es) abierta(s)`);
      openSessions.forEach(sess => {
        console.log(`    - ID: ${sess.id.substring(0, 8)}...`);
        console.log(`      Abierta: ${sess.created_at}`);
        console.log(`      Base: ${formatCop(sess.cash_base)}`);
      });
    }
  }

  // Query 2: Sesiones CERRADAS del día
  console.log('\n🔴 SESIONES CERRADAS (status=closed):');
  const { data: closedSessions, error: closedError } = await supabase
    .from('cash_register_sessions')
    .select('id, session_date, status, cash_base, cash_counted, opened_by, closed_by, created_at, closed_at')
    .eq('store_id', storeId)
    .eq('status', 'closed')
    .eq('session_date', sessionDate);

  if (closedError) {
    console.error(`❌ Error: ${closedError.message}`);
  } else {
    if (closedSessions.length === 0) {
      console.log('  ❌ NINGUNA');
    } else {
      console.log(`  ✓ Total: ${closedSessions.length} sesión(es) cerrada(s)`);
      closedSessions.forEach(sess => {
        console.log(`    - ID: ${sess.id.substring(0, 8)}...`);
        console.log(`      Abierta: ${sess.created_at}`);
        console.log(`      Cerrada: ${sess.closed_at}`);
        console.log(`      Base: ${formatCop(sess.cash_base)} → Contada: ${formatCop(sess.cash_counted)}`);
      });
    }
  }
}

/**
 * DIAGNÓSTICO 4: Discrepancias Registradas
 */
async function diagnoseCashDiscrepancies(storeId, sessionDate) {
  divider('⚠️  DIAGNÓSTICO 4: DISCREPANCIAS REGISTRADAS');

  console.log(`Tienda: ${storeId}`);
  console.log(`Fecha: ${sessionDate}\n`);

  const { data: discrepancies, error } = await supabase
    .from('cash_register_discrepancies')
    .select('id, session_date, expected_cash, cash_counted, difference, severity, notes, created_at')
    .eq('store_id', storeId)
    .eq('session_date', sessionDate)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`❌ Error: ${error.message}`);
  } else if (!discrepancies || discrepancies.length === 0) {
    console.log('✓ No hay discrepancias registradas');
  } else {
    console.log(`⚠️  Total: ${discrepancies.length} discrepancia(s)`);
    discrepancies.forEach(disc => {
      const symbol = disc.difference > 0 ? '📈' : '📉';
      console.log(`  ${symbol} ${disc.severity.toUpperCase()}: ${formatCop(disc.difference)}`);
      console.log(`    Esperado: ${formatCop(disc.expected_cash)} vs Contado: ${formatCop(disc.cash_counted)}`);
      console.log(`    Notas: ${disc.notes || '(sin notas)'}`);
      console.log(`    Registrada: ${disc.created_at}`);
    });
  }
}

/**
 * CONCLUSIÓN Y RECOMENDACIONES
 */
function printConclusion() {
  divider('📊 ANÁLISIS Y RECOMENDACIONES');

  console.log(`
Los KPIs varían entre recargas debido a:

1️⃣  FACTURAS MANUALES "PROVISIONALES"
   • El sistema SOLO incluye facturas con source='provisional'
   • Si una factura cambia de estado (a 'completed', 'voided', etc), 
     DESAPARECE del resumen
   • Posible causa: Hay lógica que actualiza el estado de facturas
   • FIX POTENCIAL: Revisar qué cambia el estado 'provisional' → otro

2️⃣  GASTOS SOFT-DELETED
   • El sistema SOLO incluye gastos con is_active=true
   • Si un gasto es marcado como inactivo, desaparece del resumen
   • Posible causa: Lógica de "eliminar" que marca como inactivo
   • FIX POTENCIAL: Revisar si hay modal de "Eliminar gasto"

3️⃣  RACE CONDITIONS
   • Las 4 queries (sales, invoices, expenses, layaway) corren en paralelo
   • Si una transacción en la base de datos está incompleta, 
     pueden dar resultados distintos entre lecturas
   • FIX POTENCIAL: Agregar transacción o read lock en Supabase

4️⃣  RLS POLICIES
   • Las políticas de Row-Level Security podrían estar filtrando 
     datos inconsistentemente según permisos del usuario
   • FIX POTENCIAL: Revisar si el usuario tiene permisos diferentes 
     en diferentes momentos

PRÓXIMOS PASOS:
  1. Ver los logs de cambios de estado en manual_invoices
  2. Buscar código que actualice source o status de facturas
  3. Revisar si hay código que marque gastos como inactivos
  4. Ejecutar este diagnóstico múltiples veces en 1-2 minutos
     y comparar los resultados (si varían = race condition)
`);
}

/**
 * MAIN
 */
async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║  POS CASH REGISTER - KPI INCONSISTENCY DIAGNOSTIC TOOL             ║
║  MODO LECTURA SOLAMENTE - No modifica la base de datos             ║
╚════════════════════════════════════════════════════════════════════╝
`);

  // Para este diagnóstico, vamos a usar la tienda del usuario 
  // Puedes cambiar estos valores si necesitas diagnóstico de otra tienda/fecha
  const storeId = 'lick4n42'; // Ajusta según tu setup
  const sessionDate = '2026-08-06'; // Usa la fecha de los screenshots

  try {
    await diagnoseManualInvoices(storeId, sessionDate);
    await diagnoseExpenses(storeId, sessionDate);
    await diagnoseCashRegisterSessions(storeId, sessionDate);
    await diagnoseCashDiscrepancies(storeId, sessionDate);
    printConclusion();

    console.log(`\n✅ Diagnóstico completado exitosamente`);
    console.log(`📝 Tip: Ejecuta este script de nuevo en 1-2 minutos y compara resultados`);
  } catch (error) {
    console.error(`\n❌ Error durante diagnóstico: ${error.message}`);
    process.exit(1);
  }
}

main();
