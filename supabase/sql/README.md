# Ejecucion ordenada en Supabase

## Orden recomendado
1. `01_tables.sql`
2. `02_seed.sql`
3. `03_rls_policies.sql`
4. `04_pos_sale_rpc.sql`
5. `05_sale_void_rpc.sql`
6. `06_user_management_rpc.sql`
7. `07_discount_authorization_and_cashier_inventory.sql`
8. `08_set_currency_cop.sql`

## Desde Supabase Dashboard
1. Ir a `SQL Editor`.
2. Crear una query nueva.
3. Pegar y ejecutar `01_tables.sql`.
4. Repetir con `02_seed.sql`.
5. Repetir con `03_rls_policies.sql`.
6. Repetir con `04_pos_sale_rpc.sql`.
7. Repetir con `05_sale_void_rpc.sql`.
8. Repetir con `06_user_management_rpc.sql`.
9. Repetir con `07_discount_authorization_and_cashier_inventory.sql`.
10. Repetir con `08_set_currency_cop.sql`.

## Si aparece error
- Revisar la linea exacta que marca el editor.
- Ejecutar solo el bloque que falla para depurar rapido.
- Las policies estan en modo idempotente (`drop policy if exists`) para que puedas re-ejecutar sin romper.

## Nota
No uses `service_role` en frontend. Solo `anon key`.

## Crear primer Super Admin (manual desde DB)
1. Crea el usuario en `Authentication > Users` (email/password).
2. Ejecuta este SQL en `SQL Editor`, reemplazando email y codigo de tienda:

```sql
-- Asegura que exista una tienda (ajusta si ya tienes otra)
insert into public.organizations (name)
values ('POS Org')
on conflict do nothing;

insert into public.stores (organization_id, code, name)
select o.id, 'MAIN', 'Tienda Principal'
from public.organizations o
where o.name = 'POS Org'
on conflict (organization_id, code) do nothing;

-- Vincula usuario auth a profile
insert into public.profiles (id, full_name, email, is_active)
select u.id, 'Super Admin', u.email, true
from auth.users u
where lower(u.email) = lower('tu-super-admin@dominio.com')
on conflict (id) do update
set full_name = excluded.full_name,
	email = excluded.email,
	is_active = true;

-- Asigna rol super_admin a la tienda
insert into public.user_store_roles (user_id, store_id, role_id, is_active)
select u.id, s.id, r.id, true
from auth.users u
join public.stores s on s.code = 'MAIN'
join public.roles r on r.code = 'super_admin'
where lower(u.email) = lower('tu-super-admin@dominio.com')
on conflict (user_id, store_id, role_id) do update
set is_active = true;
```

3. Inicia sesion en la app con ese usuario.
4. En menu `Usuarios`, el Super Admin podra crear `admin` y `cajero`.
5. Un usuario `admin` solo podra crear `cajero`.
