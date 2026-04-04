-- 06_user_management_rpc.sql
-- Gestion de usuarios desde app:
-- - Super admin: crear admin y cajero
-- - Admin: crear cajero

alter table public.profiles enable row level security;
alter table public.user_store_roles enable row level security;
alter table public.roles enable row level security;

create extension if not exists pgcrypto with schema extensions;

-- Reforzar funciones helper para evitar recursion de RLS
create or replace function public.current_user_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select usr.store_id
  from public.user_store_roles usr
  where usr.user_id = auth.uid()
    and usr.is_active = true;
$$;

create or replace function public.current_user_has_role(role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_store_roles usr
    join public.roles r on r.id = usr.role_id
    where usr.user_id = auth.uid()
      and usr.is_active = true
      and r.code = role_code
  );
$$;

grant execute on function public.current_user_store_ids() to authenticated;
grant execute on function public.current_user_has_role(text) to authenticated;

-- roles

drop policy if exists roles_read_policy on public.roles;
create policy roles_read_policy on public.roles
for select
using (
  auth.role() = 'authenticated'
);

-- profiles

drop policy if exists profiles_self_read_policy on public.profiles;
create policy profiles_self_read_policy on public.profiles
for select
using (id = auth.uid());

drop policy if exists profiles_store_read_policy on public.profiles;
create policy profiles_store_read_policy on public.profiles
for select
using (
  exists (
    select 1
    from public.user_store_roles usr
    where usr.user_id = profiles.id
      and usr.store_id in (select public.current_user_store_ids())
      and usr.is_active = true
  )
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

-- user_store_roles

drop policy if exists usr_read_policy on public.user_store_roles;
create policy usr_read_policy on public.user_store_roles
for select
using (
  user_id = auth.uid()
  or (
    store_id in (select public.current_user_store_ids())
    and (
      public.current_user_has_role('super_admin')
      or (
        public.current_user_has_role('admin')
        and role_id in (
          select r.id
          from public.roles r
          where r.code in ('admin', 'cashier')
        )
      )
    )
  )
);

-- RPC para crear usuario operativo desde la app
drop function if exists public.create_pos_user(text, text, text, uuid, text);

create or replace function public.create_pos_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_store_id uuid,
  p_role_code text
)
returns table (out_user_id uuid, out_email text, out_role_code text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_role_id uuid;
  v_new_user_id uuid;
  v_email text;
  v_name text;
  v_allowed boolean := false;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  v_name := trim(coalesce(p_full_name, ''));

  if v_email = '' then
    raise exception 'Email requerido.';
  end if;

  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password minimo 6 caracteres.';
  end if;

  if v_name = '' then
    raise exception 'Nombre requerido.';
  end if;

  if p_role_code not in ('admin', 'cashier') then
    raise exception 'Rol invalido. Solo admin o cashier.';
  end if;

  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso a la tienda indicada.';
  end if;

  if public.current_user_has_role('super_admin') then
    v_allowed := true;
  elsif public.current_user_has_role('admin') and p_role_code = 'cashier' then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'No autorizado para crear este tipo de usuario.';
  end if;

  select id into v_role_id
  from public.roles
  where code = p_role_code;

  if v_role_id is null then
    raise exception 'Rol no encontrado en tabla roles.';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Ya existe un usuario con ese email.';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    extensions.gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', v_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  returning id into v_new_user_id;

  insert into public.profiles (id, full_name, email, is_active)
  values (v_new_user_id, v_name, v_email, true)
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        is_active = true;

  insert into public.user_store_roles (user_id, store_id, role_id, is_active)
  values (v_new_user_id, p_store_id, v_role_id, true)
  on conflict (user_id, store_id, role_id) do update
    set is_active = true;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    p_store_id,
    auth.uid(),
    'user_created',
    'profiles',
    v_new_user_id,
    jsonb_build_object('email', v_email, 'role_code', p_role_code)
  );

  return query
  select
    v_new_user_id as out_user_id,
    v_email as out_email,
    p_role_code as out_role_code;
end;
$$;

grant execute on function public.create_pos_user(text, text, text, uuid, text) to authenticated;

drop function if exists public.update_pos_user_role(uuid, text);

create or replace function public.update_pos_user_role(
  p_assignment_id uuid,
  p_role_code text
)
returns table (out_assignment_id uuid, out_user_id uuid, out_role_code text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_store_id uuid;
  v_user_id uuid;
  v_current_role_code text;
  v_target_role_id uuid;
  v_allowed boolean := false;
begin
  if p_role_code not in ('admin', 'cashier') then
    raise exception 'Rol invalido. Solo admin o cashier.';
  end if;

  select usr.store_id, usr.user_id, r.code
  into v_store_id, v_user_id, v_current_role_code
  from public.user_store_roles usr
  join public.roles r on r.id = usr.role_id
  where usr.id = p_assignment_id
    and usr.is_active = true;

  if v_store_id is null then
    raise exception 'Asignacion no encontrada.';
  end if;

  if not (v_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso a la tienda indicada.';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'No puedes editar tu propio rol.';
  end if;

  if v_current_role_code = 'super_admin' then
    raise exception 'No se puede editar rol de Super Admin.';
  end if;

  if public.current_user_has_role('super_admin') then
    v_allowed := true;
  elsif public.current_user_has_role('admin') then
    if p_role_code = 'cashier' and v_current_role_code = 'cashier' then
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    raise exception 'No autorizado para editar este usuario.';
  end if;

  select id into v_target_role_id
  from public.roles
  where code = p_role_code;

  if v_target_role_id is null then
    raise exception 'Rol no encontrado en tabla roles.';
  end if;

  update public.user_store_roles
  set role_id = v_target_role_id
  where id = p_assignment_id;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    v_store_id,
    auth.uid(),
    'user_role_updated',
    'user_store_roles',
    p_assignment_id,
    jsonb_build_object('user_id', v_user_id, 'role_code', p_role_code)
  );

  return query
  select p_assignment_id, v_user_id, p_role_code;
end;
$$;

grant execute on function public.update_pos_user_role(uuid, text) to authenticated;

drop function if exists public.deactivate_pos_user(uuid);

create or replace function public.deactivate_pos_user(
  p_assignment_id uuid
)
returns table (out_assignment_id uuid, out_user_id uuid, out_is_active boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_store_id uuid;
  v_user_id uuid;
  v_current_role_code text;
  v_allowed boolean := false;
begin
  select usr.store_id, usr.user_id, r.code
  into v_store_id, v_user_id, v_current_role_code
  from public.user_store_roles usr
  join public.roles r on r.id = usr.role_id
  where usr.id = p_assignment_id
    and usr.is_active = true;

  if v_store_id is null then
    raise exception 'Asignacion no encontrada.';
  end if;

  if not (v_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso a la tienda indicada.';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'No puedes desactivar tu propio usuario.';
  end if;

  if v_current_role_code = 'super_admin' then
    raise exception 'No se puede desactivar un Super Admin desde esta accion.';
  end if;

  if public.current_user_has_role('super_admin') then
    v_allowed := true;
  elsif public.current_user_has_role('admin') and v_current_role_code = 'cashier' then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'No autorizado para desactivar este usuario.';
  end if;

  update public.user_store_roles
  set is_active = false
  where id = p_assignment_id;

  update public.profiles p
  set is_active = exists (
    select 1
    from public.user_store_roles usr
    where usr.user_id = p.id
      and usr.is_active = true
  )
  where p.id = v_user_id;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    v_store_id,
    auth.uid(),
    'user_deactivated',
    'user_store_roles',
    p_assignment_id,
    jsonb_build_object('user_id', v_user_id, 'is_active', false)
  );

  return query
  select p_assignment_id, v_user_id, false;
end;
$$;

grant execute on function public.deactivate_pos_user(uuid) to authenticated;

drop function if exists public.reactivate_pos_user(uuid);

create or replace function public.reactivate_pos_user(
  p_assignment_id uuid
)
returns table (out_assignment_id uuid, out_user_id uuid, out_is_active boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_store_id uuid;
  v_user_id uuid;
  v_current_role_code text;
  v_allowed boolean := false;
begin
  select usr.store_id, usr.user_id, r.code
  into v_store_id, v_user_id, v_current_role_code
  from public.user_store_roles usr
  join public.roles r on r.id = usr.role_id
  where usr.id = p_assignment_id;

  if v_store_id is null then
    raise exception 'Asignacion no encontrada.';
  end if;

  if not (v_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso a la tienda indicada.';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'No puedes reactivar tu propio usuario desde esta accion.';
  end if;

  if v_current_role_code = 'super_admin' then
    raise exception 'No se puede reactivar un Super Admin desde esta accion.';
  end if;

  if public.current_user_has_role('super_admin') then
    v_allowed := true;
  elsif public.current_user_has_role('admin') and v_current_role_code = 'cashier' then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'No autorizado para reactivar este usuario.';
  end if;

  update public.user_store_roles
  set is_active = true
  where id = p_assignment_id;

  update public.profiles
  set is_active = true
  where id = v_user_id;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    v_store_id,
    auth.uid(),
    'user_reactivated',
    'user_store_roles',
    p_assignment_id,
    jsonb_build_object('user_id', v_user_id, 'is_active', true)
  );

  return query
  select p_assignment_id, v_user_id, true;
end;
$$;

grant execute on function public.reactivate_pos_user(uuid) to authenticated;
