# Visits persistence audit (UI vs Supabase `visits` schema vs mapping)

Date: 2026-04-09

## Files inspected
- `index.html` (visit form fields)
- `app.js` (visit save payload, schema gating, and load mapping)

## Key finding
The save path is **schema-gated**: `buildVisitInsertRow()` builds a rich row, but then removes any keys not present in `loadVisitsSchema()`’s discovered columns. If `visits` only has the minimal required columns, most clinical form fields are dropped before insert.

## App-verified minimum `visits` schema
`loadVisitsSchema()` requires these columns to exist:
- `patient_id`
- `visit_date`
- `visit_type`
- `notes`
- `created_by`

Everything else is optional from the app’s perspective and only inserted/loaded if the DB actually has that column.

## Mapping table (current behavior when DB is minimal/basic)
| UI field | Current DB column | Currently saved? | Currently loaded? | Notes |
|---|---|---:|---:|---|
| Fecha (`v_date`) | `visit_date` | Yes | Yes | Required column. |
| Fármaco hospitalario (`v_hospDrug`) | `hospital_drug` | No* | No* | Saved/loaded only if optional column exists. |
| LDL (`v_ldl`) | `ldl` | No* | No* | Optional column. |
| Objetivo LDL (`v_ldlTarget`) | `ldl_target` | No* | No* | Optional column. |
| ¿Objetivo alcanzado? (`v_goalAch`) | `ldl_goal_achieved` | No* | No* | Optional column. |
| Tratamiento (`v_treatment`) | `treatment` | No* | No* | Optional column. |
| Adherencia (`v_adherence`) | `adherence` | No* | No* | Optional column. |
| RAM (`v_ram`) | `ram` | No* | No* | Optional column. |
| Justificación nivel (`v_levelWhy`) | `priority_justification` | No* | No* | Optional column. |
| OFT (`v_oft`) | `oft_objectives` | No* | No* | Optional column. |
| Plan seguimiento (`v_follow`) | `follow_up_plan` | **Partially** | No* | Also copied to required `notes` via fallback, so text can persist in `notes` even without `follow_up_plan`. |
| Intervenciones CMO picker | **none in `visits`** | No (in `visits`) | No (in `visits`) | Persisted separately in `interventions` store/table logic. |
| Texto HC (`v_hcText`) | none | No | No | Generated helper text, not persisted. |

\* No under the currently observed “basic row only” behavior (i.e., optional columns unavailable in `visits`).

## UI fields unsupported by current DB schema (under minimal/basic schema)
Unsupported in `visits` unless schema is expanded:
- `hospital_drug`, `ldl`, `ldl_target`, `ldl_goal_achieved`, `treatment`, `adherence`, `ram`,
  `priority_justification`, `oft_objectives`, `follow_up_plan`.

Also recommended for full round-trip stability:
- `local_visit_code` (to preserve frontend `visitId` instead of fallback synthesized IDs)
- `strat_vars`, `cmo_score`, `priority_level`, `next_visit_suggested`
- `created_at`, `updated_at`, `id` (metadata/ordering consistency)

## Minimal schema expansion recommended for full visit-form persistence
To persist every clinical field currently present in the visit form, add at least:
- `hospital_drug text`
- `ldl numeric`
- `ldl_target numeric`
- `ldl_goal_achieved boolean`
- `treatment text`
- `adherence text`
- `ram text`
- `priority_justification text`
- `oft_objectives text`
- `follow_up_plan text`

Strongly recommended additionally:
- `local_visit_code text unique`
- `strat_vars jsonb`
- `cmo_score integer`
- `priority_level integer`
- `next_visit_suggested date`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

## Why this mismatch happens
The insert builder includes rich keys, but `buildVisitInsertRow()` only keeps keys present in the schema-discovery allow-list. So when optional clinical columns don’t exist in `visits`, those UI values are silently dropped.
