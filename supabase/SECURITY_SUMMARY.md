# Supabase Security Summary (cmorcvtesis)

## Scope reviewed
The migration hardens security for the application tables currently used by the frontend:

- `public.profiles`
- `public.centers`
- `public.patients`
- `public.visits`

It also includes a generic pass that enables and forces RLS for **all** current public base tables to avoid uncovered tables.

## What was implemented

1. **Strict RLS**
   - Enabled + forced RLS for all `public` tables.
   - Added explicit per-table policies for profiles, centers, patients, and visits.

2. **Only authenticated users can access data**
   - All policies target `TO authenticated`.
   - No policy grants access to `anon`.

3. **Anonymous reads blocked**
   - `REVOKE ALL ON TABLE ... FROM anon` applied across public tables.
   - With forced RLS + no anon policies, anonymous reads/writes are blocked.

4. **Role separation ready (admin / pharmacist / investigator)**
   - Added helper functions:
     - `public.current_app_role()`
     - `public.has_any_role(text[])`
     - `public.current_center_id()`
   - Added optional role check constraint on `profiles.role` to allow only:
     `admin`, `pharmacist`, `investigator`.
   - Current policies already use role checks (`admin` override), so finer rules can be added without rewriting the model.

5. **Policy conflict prevention**
   - Migration drops existing policies for affected tables before creating canonical policies.
   - This avoids duplicate/overlapping policy behavior.

## Access model after migration

- **Admin**
  - Full access across centers.
- **Pharmacist / Investigator (authenticated)**
  - Access restricted to rows tied to their own `profiles.center_id`.
  - `visits` are center-scoped through linked `patients`.
- **Anonymous**
  - No table access.

## Notes

- The migration is written to be idempotent where practical (function replacement, conditional constraint).
- If new tables are added in the future, they will have RLS enabled/forced by the generic loop, but you should still add explicit least-privilege policies per table.
