-- Core schema for cardiovascular thesis app
-- Repository: cmorcvtesis

create extension if not exists pgcrypto;

-- -----------------------------
-- Utility functions
-- -----------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- -----------------------------
-- Profiles
-- -----------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  institution text,
  role text check (role in ('researcher', 'clinician', 'admin')) default 'researcher',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- -----------------------------
-- Patients
-- -----------------------------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  medical_record_number text,
  study_code text not null,
  first_name text,
  last_name text,
  sex text check (sex in ('female', 'male', 'other', 'unknown')),
  birth_date date,
  enrollment_date date,
  status text not null default 'active' check (status in ('active', 'inactive', 'withdrawn', 'deceased')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint uq_patients_study_code_owner unique (created_by, study_code),
  constraint uq_patients_mrn_owner unique (created_by, medical_record_number)
);

create index if not exists idx_patients_created_by on public.patients(created_by);
create index if not exists idx_patients_enrollment_date on public.patients(enrollment_date);
create index if not exists idx_patients_active_only on public.patients(created_by, status) where deleted_at is null;

create trigger trg_patients_updated_at
before update on public.patients
for each row
execute function public.set_updated_at();

-- -----------------------------
-- Consents
-- -----------------------------
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id),
  consent_type text not null,
  version text,
  signed_at timestamptz,
  revoked_at timestamptz,
  file_path text,
  witness_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create index if not exists idx_consents_patient_id on public.consents(patient_id);
create index if not exists idx_consents_created_by on public.consents(created_by);
create index if not exists idx_consents_signed_at on public.consents(signed_at);

create trigger trg_consents_updated_at
before update on public.consents
for each row
execute function public.set_updated_at();

-- -----------------------------
-- Visits
-- -----------------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id),
  visit_number integer,
  visit_type text not null,
  visit_date date not null,
  clinician_name text,
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  heart_rate integer,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint uq_visits_patient_visit_number unique (patient_id, visit_number)
);

create index if not exists idx_visits_patient_id on public.visits(patient_id);
create index if not exists idx_visits_created_by on public.visits(created_by);
create index if not exists idx_visits_visit_date on public.visits(visit_date desc);
create index if not exists idx_visits_active_by_patient on public.visits(patient_id, visit_date desc) where deleted_at is null;

create trigger trg_visits_updated_at
before update on public.visits
for each row
execute function public.set_updated_at();

-- -----------------------------
-- Measurements
-- -----------------------------
create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id),
  measurement_type text not null,
  value_numeric numeric(12,4),
  value_text text,
  unit text,
  measured_at timestamptz,
  source text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint chk_measurements_value_present check (value_numeric is not null or value_text is not null)
);

create index if not exists idx_measurements_visit_id on public.measurements(visit_id);
create index if not exists idx_measurements_created_by on public.measurements(created_by);
create index if not exists idx_measurements_type on public.measurements(measurement_type);

create trigger trg_measurements_updated_at
before update on public.measurements
for each row
execute function public.set_updated_at();

-- -----------------------------
-- CMO scores (one per visit)
-- -----------------------------
create table if not exists public.cmo_scores (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id),
  score_total numeric(8,2) not null,
  score_class text,
  scoring_version text,
  rationale text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint uq_cmo_scores_visit unique (visit_id)
);

create index if not exists idx_cmo_scores_created_by on public.cmo_scores(created_by);

create trigger trg_cmo_scores_updated_at
before update on public.cmo_scores
for each row
execute function public.set_updated_at();

-- -----------------------------
-- Interventions (many per visit)
-- -----------------------------
create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id),
  intervention_type text not null,
  intervention_date date,
  status text default 'planned' check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  details text,
  adverse_event boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create index if not exists idx_interventions_visit_id on public.interventions(visit_id);
create index if not exists idx_interventions_created_by on public.interventions(created_by);
create index if not exists idx_interventions_type on public.interventions(intervention_type);

create trigger trg_interventions_updated_at
before update on public.interventions
for each row
execute function public.set_updated_at();

-- -----------------------------
-- Questionnaire responses
-- -----------------------------
create table if not exists public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  questionnaire_name text not null,
  questionnaire_version text,
  responses jsonb not null,
  score numeric(10,2),
  answered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create index if not exists idx_questionnaire_patient_id on public.questionnaire_responses(patient_id);
create index if not exists idx_questionnaire_visit_id on public.questionnaire_responses(visit_id);
create index if not exists idx_questionnaire_created_by on public.questionnaire_responses(created_by);
create index if not exists idx_questionnaire_gin_responses on public.questionnaire_responses using gin (responses);

create trigger trg_questionnaire_updated_at
before update on public.questionnaire_responses
for each row
execute function public.set_updated_at();

-- -----------------------------
-- Audit log
-- -----------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_audit_log_actor_id on public.audit_log(actor_id);
create index if not exists idx_audit_log_table_record on public.audit_log(table_name, record_id);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
begin
  if tg_op = 'DELETE' then
    v_record_id := old.id;
  else
    v_record_id := new.id;
  end if;

  insert into public.audit_log (actor_id, table_name, record_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    v_record_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_audit_patients
after insert or update or delete on public.patients
for each row execute function public.log_audit_event();

create trigger trg_audit_consents
after insert or update or delete on public.consents
for each row execute function public.log_audit_event();

create trigger trg_audit_visits
after insert or update or delete on public.visits
for each row execute function public.log_audit_event();

create trigger trg_audit_measurements
after insert or update or delete on public.measurements
for each row execute function public.log_audit_event();

create trigger trg_audit_cmo_scores
after insert or update or delete on public.cmo_scores
for each row execute function public.log_audit_event();

create trigger trg_audit_interventions
after insert or update or delete on public.interventions
for each row execute function public.log_audit_event();

create trigger trg_audit_questionnaire_responses
after insert or update or delete on public.questionnaire_responses
for each row execute function public.log_audit_event();

create trigger trg_audit_profiles
after insert or update or delete on public.profiles
for each row execute function public.log_audit_event();

