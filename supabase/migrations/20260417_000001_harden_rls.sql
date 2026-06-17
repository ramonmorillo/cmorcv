-- cmorcvtesis: security hardening migration
-- Goals:
-- 1) Strict RLS on all application tables.
-- 2) Only authenticated users can access rows.
-- 3) Explicitly block anonymous access.
-- 4) Prepare role model for admin/pharmacist/investigator.
-- 5) Remove policy conflicts by dropping existing policies first.

begin;

-- -----------------------------------------------------------------------------
-- Helper functions (role + center context)
-- -----------------------------------------------------------------------------
create or replace function public.current_center_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.center_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(lower(p.role::text)), ''), 'pharmacist')
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.has_any_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any(roles), false)
$$;

comment on function public.current_center_id is
  'Returns center_id for the currently authenticated user (auth.uid()).';
comment on function public.current_app_role is
  'Returns normalized role for current user. Defaults to pharmacist when empty.';
comment on function public.has_any_role is
  'Role helper for policies. Example: has_any_role(ARRAY[''admin'']).';

-- -----------------------------------------------------------------------------
-- Review + RLS activation over every public base table
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not like 'pg_%'
      and tablename not like 'sql_%'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
    execute format('revoke all on table public.%I from anon', t.tablename);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t.tablename);
  end loop;
end
$$;

-- Optional hardening: make role values explicit (future separation path).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) then
    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'profiles'
        and c.conname = 'profiles_role_allowed_values_chk'
    ) then
      execute $ddl$
        alter table public.profiles
        add constraint profiles_role_allowed_values_chk
        check (role is null or lower(role::text) in ('admin', 'pharmacist', 'investigator'))
      $ddl$;
    end if;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Remove existing policies to avoid conflicts
-- -----------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'centers', 'patients', 'visits')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Profiles policies
-- -----------------------------------------------------------------------------
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.has_any_role(array['admin'])
);

create policy profiles_insert_self_or_admin
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  or public.has_any_role(array['admin'])
);

create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.has_any_role(array['admin'])
)
with check (
  id = auth.uid()
  or public.has_any_role(array['admin'])
);

create policy profiles_delete_admin_only
on public.profiles
for delete
to authenticated
using (public.has_any_role(array['admin']));

-- -----------------------------------------------------------------------------
-- Centers policies
-- -----------------------------------------------------------------------------
create policy centers_select_own_or_admin
on public.centers
for select
to authenticated
using (
  id = public.current_center_id()
  or public.has_any_role(array['admin'])
);

create policy centers_insert_admin_only
on public.centers
for insert
to authenticated
with check (public.has_any_role(array['admin']));

create policy centers_update_admin_only
on public.centers
for update
to authenticated
using (public.has_any_role(array['admin']))
with check (public.has_any_role(array['admin']));

create policy centers_delete_admin_only
on public.centers
for delete
to authenticated
using (public.has_any_role(array['admin']));

-- -----------------------------------------------------------------------------
-- Patients policies
-- -----------------------------------------------------------------------------
create policy patients_select_center_or_admin
on public.patients
for select
to authenticated
using (
  center_id = public.current_center_id()
  or public.has_any_role(array['admin'])
);

create policy patients_insert_center_or_admin
on public.patients
for insert
to authenticated
with check (
  center_id = public.current_center_id()
  or public.has_any_role(array['admin'])
);

create policy patients_update_center_or_admin
on public.patients
for update
to authenticated
using (
  center_id = public.current_center_id()
  or public.has_any_role(array['admin'])
)
with check (
  center_id = public.current_center_id()
  or public.has_any_role(array['admin'])
);

create policy patients_delete_center_or_admin
on public.patients
for delete
to authenticated
using (
  center_id = public.current_center_id()
  or public.has_any_role(array['admin'])
);

-- -----------------------------------------------------------------------------
-- Visits policies (center-scoped through parent patient)
-- -----------------------------------------------------------------------------
create policy visits_select_center_or_admin
on public.visits
for select
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and (
        p.center_id = public.current_center_id()
        or public.has_any_role(array['admin'])
      )
  )
);

create policy visits_insert_center_or_admin
on public.visits
for insert
to authenticated
with check (
  exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and (
        p.center_id = public.current_center_id()
        or public.has_any_role(array['admin'])
      )
  )
);

create policy visits_update_center_or_admin
on public.visits
for update
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and (
        p.center_id = public.current_center_id()
        or public.has_any_role(array['admin'])
      )
  )
)
with check (
  exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and (
        p.center_id = public.current_center_id()
        or public.has_any_role(array['admin'])
      )
  )
);

create policy visits_delete_center_or_admin
on public.visits
for delete
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and (
        p.center_id = public.current_center_id()
        or public.has_any_role(array['admin'])
      )
  )
);

commit;
