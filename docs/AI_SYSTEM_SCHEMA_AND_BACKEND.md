# AI System — Schema & Backend Requirements

This document defines the **backend schema, events, and services** required for the AI Decision Layer, Optimization Engine, Learning Loop, and Impact Metrics. **Migrations and tables live in Q-unified-base** `supabase/migrations/`. The mobile app (q-mobile) consumes this data via Supabase client and optional RPCs.

---

## Architecture Overview

```
Event Listener → Decision Models → Action Generator → Execution → Feedback Capture
```

- **Event bus**: Every major system action creates an `events` row.
- **Decision models**: Payment risk, trip profit prediction, cost anomaly, maintenance prediction.
- **Optimization service**: Smart pricing, credit enforcement, expense control, cashflow forecast.
- **Learning loop**: `ai_feedback` table + scheduled retrain + accuracy dashboard.
- **Autonomous layer**: `ai_settings` toggles (auto_flag_risk, auto_enforce_credit, etc.).

---

## PART 1 — Event System

### Table: `events`

| Column       | Type      | Description                          |
|-------------|-----------|--------------------------------------|
| id          | uuid      | PK, default gen_random_uuid()        |
| event_type  | text      | NOT NULL                             |
| entity_id   | uuid      | nullable (trip_id, client_id, etc.)  |
| entity_type | text      | nullable (trip, client, vehicle…)   |
| payload     | jsonb     | nullable                            |
| created_at  | timestamptz | default now()                      |
| processed   | boolean   | default false                        |

**Event types to emit:**

- `trip_created`
- `trip_completed`
- `transaction_created`
- `payment_overdue`
- `expense_added`
- `vehicle_idle`
- `fuel_cost_spike`
- `expense_anomaly_detected` (from AI)

**Index:** `(processed, created_at)`, `(event_type, created_at)`.

---

## PART 2 — Decision Models (Storage)

### Table: `client_risk_scores`

| Column          | Type      | Description                |
|-----------------|-----------|----------------------------|
| id              | uuid      | PK                         |
| organization_id | uuid      | FK, NOT NULL               |
| client_id       | uuid      | FK clients, NOT NULL, UNIQUE per org |
| risk_score      | integer   | 0–100                      |
| predicted_delay | integer   | days                       |
| last_updated    | timestamptz | default now()            |

### Table: `trip_predictions`

| Column            | Type      | Description        |
|-------------------|-----------|--------------------|
| id                | uuid      | PK                 |
| organization_id   | uuid      | FK, NOT NULL       |
| trip_id           | uuid      | FK trips, NOT NULL, UNIQUE |
| predicted_cost    | numeric   |                    |
| predicted_profit  | numeric   |                    |
| confidence_score  | numeric   | 0–1                |
| risk_flag         | text      | e.g. 'low_margin', 'ok' |
| created_at        | timestamptz | default now()   |

### Table: `vehicle_health_scores`

| Column               | Type      | Description              |
|----------------------|-----------|--------------------------|
| id                   | uuid      | PK                       |
| organization_id      | uuid      | FK, NOT NULL             |
| vehicle_id           | uuid      | FK vehicles, NOT NULL, UNIQUE per org |
| health_score         | integer   | 0–100                    |
| next_maintenance_at  | date      | nullable                 |
| breakdown_probability | numeric   | 0–1, nullable            |
| last_updated         | timestamptz | default now()          |

### Table: `cashflow_forecast`

| Column           | Type      | Description     |
|------------------|-----------|-----------------|
| id               | uuid      | PK              |
| organization_id  | uuid      | FK, NOT NULL    |
| date             | date      | NOT NULL        |
| expected_inflow  | numeric   |                 |
| confidence       | numeric   | 0–1             |
| created_at       | timestamptz | default now() |
| UNIQUE(organization_id, date) |  |                |

---

## PART 3 — AI Feedback & Learning

### Table: `ai_feedback`

| Column           | Type      | Description                    |
|------------------|-----------|--------------------------------|
| id               | uuid      | PK                             |
| organization_id  | uuid      | FK, NOT NULL                   |
| model_name       | text      | e.g. 'payment_delay_risk', 'trip_profit' |
| entity_id        | uuid      | nullable                       |
| entity_type      | text      | nullable                       |
| prediction       | jsonb     | stored prediction              |
| actual_outcome   | jsonb     | actual result                  |
| error_margin     | numeric   | nullable                       |
| accepted_by_user | boolean   | default false                  |
| timestamp        | timestamptz | default now()               |

**Scheduled job (backend):** Weekly retrain regression models; update risk/pricing weights.

---

## PART 4 — Autonomous Action Config

### Table: `ai_settings`

| Column                  | Type    | Description        |
|-------------------------|---------|--------------------|
| id                      | uuid    | PK                 |
| organization_id         | uuid    | FK, UNIQUE         |
| auto_post_ocr           | boolean | default false      |
| auto_flag_risk          | boolean | default false      |
| auto_enforce_credit     | boolean | default false      |
| auto_assign_vehicle     | boolean | default false      |
| updated_at              | timestamptz | default now()   |

---

## PART 5 — Impact Metrics (Computed / Stored)

Suggested table or materialized view for **impact_metrics** (optional):

| Column                          | Type    |
|---------------------------------|---------|
| organization_id                 | uuid    |
| period_start                    | date    |
| period_end                      | date    |
| margin_improvement_pct          | numeric |
| overdue_reduction_pct           | numeric |
| expense_anomaly_prevented_amount| numeric |
| cashflow_predictability_improvement | numeric |
| profit_prediction_accuracy_pct  | numeric |
| payment_delay_prediction_accuracy_pct | numeric |
| anomaly_detection_precision_pct | numeric |
| ai_suggestion_acceptance_pct    | numeric |

---

## RPCs / API for Mobile (q-mobile)

The app will call Supabase from the **ai.service** (features/ai):

1. **client_risk_scores** — `select().eq('organization_id', orgId).eq('client_id', clientId).maybeSingle()`
2. **trip_predictions** — `select().eq('trip_id', tripId).maybeSingle()`
3. **vehicle_health_scores** — `select().eq('organization_id', orgId).eq('vehicle_id', vehicleId).maybeSingle()`
4. **cashflow_forecast** — `select().eq('organization_id', orgId).gte('date', today).order('date').limit(30)`
5. **ai_settings** — `select().eq('organization_id', orgId).maybeSingle()`
6. **ai_insights** (optional RPC) — returns summary: cashflow next 30 days, accuracy %, top risks.

If tables do not exist yet, the mobile app will receive errors and show "—" or empty state; no crash.

---

## Backend Implementation Notes

- **Event bus**: In Q-unified-base (or backend service), on trip create/complete, transaction create, payment overdue, expense add, etc., insert into `events`.
- **Decision models**: Implement in Python (e.g. FastAPI + sklearn) or Node + lightweight ML (e.g. simple-regression, simple-statistics). Models: linear/logistic regression, isolation forest for anomaly, moving average for trends.
- **Optimization service**: On trip create UI request, backend can return `suggested_freight`, `min_profitable_rate`, `expected_margin_pct` (from RPC or Edge Function).
- **Retraining**: Weekly cron to recompute risk weights, pricing formula weights from `ai_feedback`.

---

## AI System Flow (Summary)

1. **Trip created** → Event → AI predicts profit → Suggest rate → User accepts/overrides → Feedback stored → Model updates.
2. **Payment delayed** → Risk score adjusted → Credit flag triggered (if auto_enforce_credit).
3. **Expense added** → Anomaly check → Flag or approve → Optionally create `expense_anomaly_detected` event.
