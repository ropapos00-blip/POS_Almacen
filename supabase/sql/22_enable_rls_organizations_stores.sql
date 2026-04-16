-- 22_enable_rls_organizations_stores.sql
-- Corrige advertencias de Supabase: habilita RLS en organizations y stores
-- sin romper el flujo actual de login/lectura de tienda.

alter table public.organizations enable row level security;
alter table public.stores enable row level security;

-- -------- stores --------
drop policy if exists stores_public_read_policy on public.stores;
create policy stores_public_read_policy on public.stores
for select
 to anon
using (is_active = true);

drop policy if exists stores_tenant_read_policy on public.stores;
create policy stores_tenant_read_policy on public.stores
for select
 to authenticated
using (id in (select public.current_user_store_ids()));

-- No se crean policies de escritura aqui.
-- Las escrituras deben seguir pasando por RPCs SECURITY DEFINER con validaciones.

-- -------- organizations --------
drop policy if exists organizations_tenant_read_policy on public.organizations;
create policy organizations_tenant_read_policy on public.organizations
for select
  to authenticated
using (
  exists (
    select 1
    from public.stores s
    where s.organization_id = organizations.id
      and s.id in (select public.current_user_store_ids())
  )
);

-- No se habilita lectura anonima de organizations.
