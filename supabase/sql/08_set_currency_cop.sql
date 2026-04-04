-- 08_set_currency_cop.sql
-- Configurar moneda local COP en tiendas existentes

update public.stores
set currency = 'COP'
where currency is distinct from 'COP';
