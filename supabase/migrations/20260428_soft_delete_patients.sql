-- Soft delete support for patients + scoped UPDATE RLS policy by center.

alter table public.patients
  add column if not exists deleted_at timestamptz;

-- Optional helper index for active-patients queries.
create index if not exists idx_patients_center_deleted_at
  on public.patients (center_id, deleted_at);

-- Allow authenticated users to soft-delete (UPDATE deleted_at)
-- only within their own center as defined in profiles.center_id.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'patients'
      and policyname = 'patients_update_same_center'
  ) then
    create policy patients_update_same_center
      on public.patients
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.center_id = patients.center_id
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.center_id = patients.center_id
        )
      );
  end if;
end $$;
