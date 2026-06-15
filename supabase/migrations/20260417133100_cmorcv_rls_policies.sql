-- Row Level Security and policies

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.consents enable row level security;
alter table public.visits enable row level security;
alter table public.measurements enable row level security;
alter table public.cmo_scores enable row level security;
alter table public.interventions enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: users can manage only their own profile
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Patients: owner can manage own records
create policy patients_select_owner
on public.patients
for select
to authenticated
using (created_by = auth.uid() and deleted_at is null);

create policy patients_insert_owner
on public.patients
for insert
to authenticated
with check (created_by = auth.uid());

create policy patients_update_owner
on public.patients
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

-- Consents: access is delegated through patient ownership
create policy consents_select_patient_owner
on public.consents
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.patients p
    where p.id = consents.patient_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
  )
);

create policy consents_insert_patient_owner
on public.consents
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.patients p
    where p.id = consents.patient_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
  )
);

create policy consents_update_patient_owner
on public.consents
for update
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = consents.patient_id
      and p.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.patients p
    where p.id = consents.patient_id
      and p.created_by = auth.uid()
  )
);

-- Visits: access is delegated through patient ownership
create policy visits_select_patient_owner
on public.visits
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
  )
);

create policy visits_insert_patient_owner
on public.visits
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
  )
);

create policy visits_update_patient_owner
on public.visits
for update
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and p.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.patients p
    where p.id = visits.patient_id
      and p.created_by = auth.uid()
  )
);

-- Measurements: access is delegated through visit -> patient ownership
create policy measurements_select_visit_owner
on public.measurements
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = measurements.visit_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
      and v.deleted_at is null
  )
);

create policy measurements_insert_visit_owner
on public.measurements
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = measurements.visit_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
      and v.deleted_at is null
  )
);

create policy measurements_update_visit_owner
on public.measurements
for update
to authenticated
using (
  exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = measurements.visit_id
      and p.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = measurements.visit_id
      and p.created_by = auth.uid()
  )
);

-- CMO scores: one score per visit; access by visit ownership
create policy cmo_scores_select_visit_owner
on public.cmo_scores
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = cmo_scores.visit_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
      and v.deleted_at is null
  )
);

create policy cmo_scores_insert_visit_owner
on public.cmo_scores
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = cmo_scores.visit_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
      and v.deleted_at is null
  )
);

create policy cmo_scores_update_visit_owner
on public.cmo_scores
for update
to authenticated
using (
  exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = cmo_scores.visit_id
      and p.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = cmo_scores.visit_id
      and p.created_by = auth.uid()
  )
);

-- Interventions: access by visit ownership
create policy interventions_select_visit_owner
on public.interventions
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = interventions.visit_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
      and v.deleted_at is null
  )
);

create policy interventions_insert_visit_owner
on public.interventions
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = interventions.visit_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
      and v.deleted_at is null
  )
);

create policy interventions_update_visit_owner
on public.interventions
for update
to authenticated
using (
  exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = interventions.visit_id
      and p.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.visits v
    join public.patients p on p.id = v.patient_id
    where v.id = interventions.visit_id
      and p.created_by = auth.uid()
  )
);

-- Questionnaire responses: access by patient ownership
create policy questionnaire_select_patient_owner
on public.questionnaire_responses
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.patients p
    where p.id = questionnaire_responses.patient_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
  )
);

create policy questionnaire_insert_patient_owner
on public.questionnaire_responses
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.patients p
    where p.id = questionnaire_responses.patient_id
      and p.created_by = auth.uid()
      and p.deleted_at is null
  )
  and (
    questionnaire_responses.visit_id is null
    or exists (
      select 1
      from public.visits v
      where v.id = questionnaire_responses.visit_id
        and v.patient_id = questionnaire_responses.patient_id
        and v.deleted_at is null
    )
  )
);

create policy questionnaire_update_patient_owner
on public.questionnaire_responses
for update
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = questionnaire_responses.patient_id
      and p.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.patients p
    where p.id = questionnaire_responses.patient_id
      and p.created_by = auth.uid()
  )
  and (
    questionnaire_responses.visit_id is null
    or exists (
      select 1
      from public.visits v
      where v.id = questionnaire_responses.visit_id
        and v.patient_id = questionnaire_responses.patient_id
    )
  )
);

-- Audit log: users can read only own entries, no direct writes/deletes
create policy audit_log_select_own
on public.audit_log
for select
to authenticated
using (actor_id = auth.uid());

-- Soft-delete helper function for application use
create or replace function public.soft_delete_record(target_table regclass, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format(
    'update %s set deleted_at = timezone(''utc'', now()), deleted_by = auth.uid() where id = $1',
    target_table
  ) using target_id;
end;
$$;

