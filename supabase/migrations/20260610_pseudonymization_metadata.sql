-- Pseudonymization metadata for new patients.
-- This migration is intentionally non-destructive: it does not change any existing
-- patient identifier in local_patient_code and does not store source/original codes
-- or pseudonymization secrets.

alter table public.patients
  add column if not exists id_scheme text,
  add column if not exists pseudonymization_version text,
  add column if not exists pseudonymization_namespace text;

comment on column public.patients.id_scheme is
  'Identifier scheme: legacy_manual for historical manual IDs, pseudonymized_v1 for browser-generated RCV pseudonyms.';
comment on column public.patients.pseudonymization_version is
  'Pseudonymization algorithm version for browser-generated patient IDs. Does not contain secrets.';
comment on column public.patients.pseudonymization_namespace is
  'Public namespace used by browser-side pseudonymization. Does not contain secrets.';

-- Mark existing rows as legacy when no scheme is present. This preserves their
-- current visible identifiers and relations; it only adds descriptive metadata.
update public.patients
set id_scheme = 'legacy_manual'
where id_scheme is null;

alter table public.patients
  alter column id_scheme set default 'legacy_manual';

create index if not exists idx_patients_center_scheme
  on public.patients (center_id, id_scheme);

-- RLS guardrail: this app expects center-scoped RLS. Stop deployment if RLS is off.
do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'patients'
      and c.relrowsecurity = true
  ) then
    raise exception 'RLS must be enabled on public.patients before enabling pseudonymized patient creation';
  end if;
end $$;
