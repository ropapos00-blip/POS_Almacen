-- 52_cash_register_allow_multiple_sessions_per_day.sql
-- Bug reportado: "si cierro una hora que me deje abrir de una vez".
-- Causa: cash_register_sessions tenia un unique(store_id, session_date), asi que
-- una vez cerrada la sesion de HOY, intentar "Abrir nueva sesion" el mismo dia
-- fallaba con violacion de unicidad (solo se podia abrir mañana via
-- "Apertura del dia siguiente").
--
-- Esta migracion quita esa restriccion para permitir varias sesiones el mismo
-- session_date (abrir -> cerrar -> abrir de nuevo el mismo dia). La app ya
-- garantiza que solo exista UNA sesion con status='open' a la vez (getActiveSession
-- + flujo de UI), y el resumen de caja (getDaySalesSummary) ahora se acota por el
-- rango exacto (created_at..closed_at) de cada sesion para no mezclar movimientos
-- entre sesiones del mismo dia. No se usaba ningun otro codigo que dependiera de
-- esta unicidad (getTodaySession/getLastSession son funciones sin uso actual).

do $$ begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name   = 'cash_register_sessions'
      and constraint_name = 'cash_register_sessions_store_id_session_date_key'
  ) then
    alter table public.cash_register_sessions
      drop constraint cash_register_sessions_store_id_session_date_key;
  end if;
end $$;
