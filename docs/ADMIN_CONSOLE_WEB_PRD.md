# Q Admin Console Web Application - Product Requirements Document

## 1) Executive Summary

The **Q Admin Console** is a **SaaS platform admin console** for the Q logistics ecosystem. It gives platform operators and tenant administrators a single place to manage **platform traffic**, **tenants**, **usage**, and **health**, plus full **tenant-level operations** (finance, trips, network, disputes, team access). Think of it like a SaaS product console where you manage traffic, tenants, and configuration—and where each tenant’s admins can manage their own org’s operations.

**Business value (platform):**
- **Traffic management:** View and manage API/service traffic (volume, rate limits, throttling, traffic by tenant or endpoint) so the platform stays healthy and fair.
- **Tenant management:** List and manage organizations (tenants), see usage and health per tenant, suspend/activate, and apply quotas or feature flags.
- **Platform health:** Monitor system health, error rates, latency, and RPC/contract availability across the stack.
- **Usage and analytics:** Track MAU, API call volume, feature adoption, and usage by tenant for product and commercial decisions.

**Business value (tenant operations):**
- Operational control with desktop-first visibility for finance, trips, network, and shared-ledger workflows.
- Governance via capability-based access and immutable audit logs.
- Faster exception handling with monitoring, diagnostics, and action history.

## 2) Product Overview

### What the product is

A **SaaS-style platform admin console** for Q: one web application with two layers.

1. **Platform layer (SaaS operator)**  
   For platform/ops teams who run the product:
   - **Traffic:** API and service traffic (requests, rate limits, throttling, traffic by tenant/endpoint).
   - **Tenants:** All organizations (tenants); usage and health per tenant; suspend/activate; quotas and limits.
   - **Usage & analytics:** MAU, API calls, feature usage, adoption metrics.
   - **Platform health:** Uptime, errors, latency, dependency and RPC health.
   - **Configuration:** Feature flags, global limits, maintenance windows.

2. **Tenant layer (org admin)**  
   For admins inside a single organization (same as today’s q-mobile domains):
   - Organization and team management
   - Clients, suppliers, drivers, vehicles; trips and indents
   - Finance ledger and reporting; network and shared-ledger disputes
   - AI/Ops governance and audit

The console is a multi-tenant web app on Pulse’s shared Supabase backend. Platform-layer features are scoped to platform admins; tenant-layer features are scoped per organization and use the existing capability model.

### Who uses it

- **Platform / SaaS admins** — Manage traffic, tenants, usage, health, and platform config (platform layer only).
- **Org owners / super admins** — Full control within their org (tenant layer).
- **Finance admins, dispatch managers, network admins** — Domain-specific operations within an org (tenant layer).
- **Compliance and audit reviewers** — Audit logs and evidence (platform and tenant).
- **Support admins** — Diagnostics and read-only troubleshooting (platform and tenant, scoped).

### Why it exists

- **Platform:** To run Q as a SaaS product: control traffic, manage tenants, see usage and health, and fix issues at the platform level.
- **Tenant:** Mobile is for field and quick actions; the console is for oversight, bulk operations, policy, and high-density data (finance, trips, network, disputes) in a desktop-first way.

### Product boundaries

In scope:
- **Platform:** Traffic management, tenant list/health/usage, platform health, usage analytics, platform-level config.
- **Tenant:** All existing Q domains (org, team, entities, trips, finance, network, disputes, AI) with capability-based access.
- Single codebase; platform vs tenant scope enforced by role and data boundaries.

Out of scope for MVP:
- Replacing mobile dispatcher/driver UX.
- Separate billing/payments UI (usage data only).
- Schema migration lifecycle (remains in Q-unified-base).

## 3) Current Workspace Context and Constraints

### Existing architecture alignment

The admin console must align with:
- Shared backend model: Supabase Auth + Postgres + RPC + RLS.
- Capability model: `fleet_management`, `dispatch`, `dispatch_for_own_fleet`, `marketplace_post`, `marketplace_bid`, `finance_view`, `finance_manage`, `team_manage`.
- Domain boundaries: service-per-domain pattern already used in features/services.

Primary domain contracts reflected in current code:
- Auth/profile and operating model in `features/auth/services/auth.service.ts`
- Capabilities in `lib/capabilities.ts`
- Trips in `features/trips/services/trips.service.ts`
- Finance ledger in `features/finance/services/finance.service.ts`
- Driver invite/ledger in `features/drivers/services/drivers.service.ts`
- Org connections in `services/connectionRequestsService.ts`
- Shared ledger/disputes in `services/sharedLedgerService.ts`

### Key risks to account for

- Contract drift risk between local and upstream schema artifacts.
- `transactions` naming dependency in finance workflows.
- Need for centralized immutable admin audit (beyond console logs).
- Sensitive operations currently spread across UI/service layers.

## 4) User Personas

### Persona A - Org Owner / Super Admin

- Goals: control access, enforce policy, monitor org health and risk.
- Frequency: daily oversight, weekly governance and exceptions.
- Key tasks: capability assignment, approval of high-risk actions, audit review.
- Success criteria: no unauthorized actions, faster exception closure.

### Persona B - Finance Admin

- Goals: manage ledger correctness, monitor inflow/outflow, resolve payment disputes.
- Frequency: hourly/daily.
- Key tasks: review ledger entries, adjust/payment corrections (with audit), dispute handling.
- Success criteria: faster reconciliation, reduced outstanding mismatches.

### Persona C - Operations Dispatch Manager

- Goals: maintain trip throughput, assignment efficiency, SLA compliance.
- Frequency: continuous during operations hours.
- Key tasks: trip assignment corrections, status interventions, indent/trip oversight.
- Success criteria: reduced assignment errors, better on-time completion.

### Persona D - Network/Partnership Admin

- Goals: manage org handshakes and partner relationships.
- Frequency: daily/weekly.
- Key tasks: process connection requests, track shared-ledger partner health.
- Success criteria: faster partner onboarding, lower unresolved network issues.

### Persona E - Compliance/Audit Reviewer

- Goals: verify who changed what, when, and why.
- Frequency: periodic + incident-driven.
- Key tasks: inspect audit trails, export evidence, review sensitive actions.
- Success criteria: complete traceability and policy adherence.

### Persona F - Support Admin (Internal)

- Goals: assist tenant orgs with operational incidents and data issues.
- Frequency: incident-driven.
- Key tasks: scoped impersonation-safe diagnostics, read-heavy troubleshooting.
- Success criteria: lower mean time to resolution (MTTR) without over-privilege.

### Persona G - Platform / SaaS Admin

- Goals: run the Q product as a platform—manage traffic, tenants, usage, and health.
- Frequency: daily monitoring; incident and release-driven for config/throttling.
- Key tasks: view and tune traffic (rate limits, throttling), manage tenant list and health, monitor usage and errors, set feature flags or global limits, respond to platform incidents.
- Success criteria: stable traffic and latency, clear tenant and usage visibility, fast platform incident response.

## 5) Permission and RBAC Specification

### RBAC principles

- Use existing capability model; do not create a parallel role system.
- Persona access is capability bundles + org-scoped membership.
- Enforce permissions at three layers: UI visibility, API authorization, DB RLS.
- Sensitive actions require elevated capability and explicit audit reason.

### Capability bundle examples

- **Platform Admin bundle:** platform-only access (traffic, tenants, usage, health, config). Separate from org membership; e.g. super-user or dedicated platform role.
- Super Admin bundle (tenant): all org capabilities + policy override flags.
- Finance Admin bundle: `finance_view`, `finance_manage`.
- Dispatch Manager bundle: `dispatch`, `dispatch_for_own_fleet`, optional `fleet_management`.
- Network Admin bundle: `dispatch`, `team_manage`, `finance_view` (read-only reconciliation).
- Auditor bundle: read-only custom policy with no mutating capabilities.

### Platform vs tenant scope

| Scope | Who | Examples |
|-------|-----|----------|
| **Platform** | Platform / SaaS admin (Persona G) | Traffic dashboard, tenant list, usage analytics, platform health, feature flags, rate limits. |
| **Tenant** | Org members (Personas A–F) | Team, clients, trips, finance, network, disputes, audit within one org. |

Platform-layer UI and APIs MUST be gated so only users with platform-admin permission can access. Tenant-layer uses existing capability model per org.

### Capability to module matrix

| Module | Scope | View | Mutate |
|--------|--------|------|--------|
| **Traffic** | Platform | platform_admin | platform_admin |
| **Tenants** | Platform | platform_admin | platform_admin |
| **Usage & Analytics** | Platform | platform_admin | — |
| **Platform Health** | Platform | platform_admin | — (config: platform_admin) |
| **Platform Config** | Platform | platform_admin | platform_admin |
| Team and Access | Tenant | `team_manage` | `team_manage` |
| Clients/Suppliers | Tenant | `dispatch` or `dispatch_for_own_fleet` | same + policy check for deletes/merges |
| Drivers/Vehicles | Tenant | `fleet_management` | `fleet_management` |
| Trips/Indents | Tenant | `dispatch` or `dispatch_for_own_fleet` | same |
| Finance Ledger | Tenant | `finance_view` | `finance_manage` |
| Shared Ledger/Disputes | Tenant | `finance_view` | `finance_manage` |
| Network Requests | Tenant | `team_manage` or `dispatch` | `team_manage` recommended |
| AI/Ops Governance | Tenant | `finance_view`/`dispatch` | `team_manage` + module-specific |
| Audit Console | Both | platform_admin or read-only policy | no direct mutation |

### Role management requirements

- Admin can assign capability bundles to members in an org.
- Changes require reason text and are fully audited.
- Optional approval workflow for high-risk grants (`finance_manage`, `team_manage`).

## 6) User Stories and Use Cases

### Platform (SaaS) — traffic, tenants, usage, health

- As a Platform Admin, I can view **traffic** (request volume, by tenant and by endpoint) so I can manage load and spot abuse.
- As a Platform Admin, I can view and adjust **rate limits and throttling** so I can protect the platform and give fair usage per tenant.
- As a Platform Admin, I can see the **tenant directory** and each tenant’s health/usage so I can support and manage customers.
- As a Platform Admin, I can **suspend or activate** a tenant when needed for compliance or abuse.
- As a Platform Admin, I can view **usage and analytics** (MAU, API calls, feature adoption) so I can run the product and plan capacity.
- As a Platform Admin, I can monitor **platform health** (uptime, errors, latency, RPC availability) so I can fix incidents quickly.
- As a Platform Admin, I can manage **platform configuration** (feature flags, global limits) so I can roll out or roll back features safely.

### User management and access (tenant)

- As an Org Owner, I can grant/revoke member capabilities so teams have least-privilege access.
- As an Auditor, I can review all access changes and who approved them.

### Operations and dispatch

- As a Dispatch Manager, I can filter trips by status and quickly reassign driver/vehicle.
- As Ops, I can inspect assignment audit to classify private vs shared assignment lineage.

### Finance and reconciliation

- As Finance Admin, I can search ledger entries by party/trip/date and correct mistakes.
- As Finance Admin, I can compare partner view vs internal view and raise/resolve disputes.

### Network and invites

- As Network Admin, I can process incoming/outgoing connection requests with clear status.
- As Ops, I can monitor driver invite funnel (sent, accepted, rejected, stale).

### Monitoring and troubleshooting

- As Support Admin, I can diagnose org-level failures (missing RPC, permission errors, contract drift).
- As Compliance, I can export audit evidence for a date range and action category.

### AI operations governance

- As Super Admin, I can review AI action proposals/executions and disable risky automations.
- As Finance/Ops lead, I can view AI report outputs and acceptance metrics.

## 7) Feature Requirements (Admin Operations by Category)

### A) Access and Organization Management

- Organization directory and settings (name, operating model, status).
- Team member list with capability bundle assignment.
- Invite/resend/deactivate member workflows.
- Access policy templates per persona.
- Access change approval queue (optional by tenant policy).

### B) Entity Management (Clients, Suppliers, Drivers, Vehicles)

- Searchable master tables with status filters and ownership metadata.
- Create/update workflows with strict validation.
- Driver linking and invite status management.
- Vehicle ownership/type governance (`owned` vs partner).
- Duplicate detection and merge assistant (Phase 2).

### C) Dispatch Control (Trips and Indents)

- Control tower list for trips and indents with saved filters.
- Assignment and status intervention tools.
- Trip detail with linked entities, ledger context, and timeline.
- Assignment audit visibility (private/shared lineage).
- Bulk action support (Phase 2).

### D) Finance and Ledger Supervision

- Ledger explorer by org, party, trip, contact type, and date.
- Create/edit ledger entries for authorized users.
- Financial summary widgets (cash in/out, net, pending/paid).
- Driver ledger oversight and payout trail.
- Report generation and export.

### E) Network, Shared Ledger, and Disputes

- Connection request inbox/sent management with approvals/rejections.
- Shared-ledger partner balance dashboard.
- Per-partner transaction-level compare and mismatch detection.
- Dispute lifecycle handling (open, review, accept/decline, resolved).
- "Accept partner view" self-correction workflow.

### F) AI and Ops Governance

- AI settings management (`ai_settings`) with per-org toggles.
- AI command/action history with guardrail outcomes.
- Confirmation requirement management for high-risk AI actions.
- AI report center with download and retention controls.

### G) Audit, Monitoring, and Diagnostics

- Central admin audit log across all mutating operations.
- Error telemetry and failed action queue.
- Contract health checks for required RPC availability.
- Security events dashboard (auth failures, forbidden action attempts).

### H) Platform & Traffic Management (SaaS platform layer)

These features are for **platform / SaaS admins** only. They provide the kind of control you expect in a SaaS product console: manage traffic, tenants, usage, and platform health.

- **Traffic management**
  - **Traffic dashboard:** Real-time and historical view of API/service request volume (requests per minute/hour, by endpoint or RPC, by tenant).
  - **Rate limits and throttling:** View and adjust rate limits per tenant or globally; enable/disable throttling; see throttle events and backpressure.
  - **Traffic by tenant:** Breakdown of traffic per organization (tenant) for fairness and abuse detection.
  - **Traffic by endpoint:** Top endpoints by call count and latency; identify hot paths and candidates for optimization or rate limits.

- **Tenant management**
  - **Tenant directory:** List all organizations (tenants) with key metadata (name, slug, operating model, created_at, status).
  - **Tenant health:** Per-tenant health signal (e.g. error rate, last activity, stuck jobs) and link into tenant-scoped audit/logs.
  - **Tenant actions:** Suspend or activate a tenant; apply quota or feature-flag overrides per tenant (Phase 2).
  - **Tenant drill-down:** From platform console, open a “tenant context” to view that org’s data (read-only or with platform override) for support.

- **Usage & analytics**
  - **Usage dashboard:** MAU (monthly active users), DAU; API call counts (total and per tenant); trend charts.
  - **Feature adoption:** Usage of key features (e.g. trips created, ledger entries, connection requests, Ops Agent calls) by tenant and globally.
  - **Quotas and limits:** Display current quota usage per tenant (if applicable); alert when approaching limits.

- **Platform health**
  - **System health:** Uptime and status of core services (Supabase, Auth, PostgREST, Realtime, Storage); simple red/amber/green or status page style.
  - **Error rates and latency:** Error rate and p95/p99 latency by endpoint or service; alerts when thresholds are breached.
  - **Dependency and RPC health:** Status of required RPCs and contracts (e.g. from `docs/SHARED_LEDGER_BACKEND_CONTRACT.md`); contract availability checks.
  - **Maintenance and incidents:** Optional maintenance window scheduling and incident timeline (Phase 2).

- **Platform configuration**
  - **Feature flags:** Global or per-tenant feature toggles (e.g. enable/disable Ops Agent, shared-ledger features).
  - **Global limits:** Default rate limits, max payload size, or other platform-wide knobs.
  - **Maintenance mode:** Optional read-only or degraded mode for the platform (Phase 2).

## 8) Functional Specifications

### 8.1 Access and Team Management

Inputs:
- org_id, member identity, capability set, reason, optional approver.

Behavior:
- Validate acting user has `team_manage`.
- Validate target user membership in org.
- Apply capability bundle atomically.
- Persist audit event with before/after capability diff.

Outputs:
- Updated member policy record.
- Audit event id and timestamp.

Errors:
- `403` insufficient permission.
- `409` concurrent update/version mismatch.
- `422` invalid capability combination.

### 8.2 Connection Request Handling

Inputs:
- request_id, action (`approve`/`reject`), reason (optional).

Behavior:
- Only pending requests can transition.
- Approve triggers relation side effects as backend contract defines.
- Record response actor and timestamp.

Outputs:
- Updated status and relation references.

Errors:
- `404` request not found or not visible by org.
- `409` request no longer pending.

### 8.3 Trip Assignment and Status Intervention

Inputs:
- trip_id, driver_id/vehicle_id, status transition payload.

Behavior:
- Validate allowed statuses: `draft`, `assigned`, `in_progress`, `completed`, `cancelled`.
- Assignment update writes assignment audit entry with previous/new values.
- Completed status requires completed_at semantics consistent with DB checks.

Outputs:
- Updated trip with audit reference.

Errors:
- `422` invalid status transition.
- `403` capability denied.
- `409` conflict or stale record.

### 8.4 Ledger Entry Management

Inputs:
- party, amount_in/amount_out, date, trip/contact references.

Behavior:
- Enforce one-sided amount rule (exactly one positive side).
- Normalize date and numeric fields.
- Restrict mutation to `finance_manage`.
- Attach audit metadata (who, why, previous values on update).

Outputs:
- persisted ledger row with derived display fields.

Errors:
- `422` both amount fields set or both zero.
- `403` no `finance_manage`.
- `409` optimistic concurrency conflict.

### 8.5 Shared-Ledger Dispute Management

Inputs:
- transaction_id, partner_org_id, snapshots, evidence, action.

Behavior:
- Prevent duplicate open disputes per transaction/org pair.
- Support `ACCEPT` / `DECLINE` resolution with policy checks.
- Show both raised and received dispute queues.

Outputs:
- dispute id/status, resolution metadata.

Errors:
- `409` duplicate active dispute.
- `422` invalid dispute payload.
- `503` required RPC unavailable.

### 8.6 AI Governance Actions

Inputs:
- org AI settings payload, action policy configs, review notes.

Behavior:
- Only authorized admins can toggle automation flags.
- AI action executions require confirmation policy where configured.
- All toggles and overrides emit audit entries.

Outputs:
- updated settings and policy revision.

Errors:
- `403` unauthorized setting change.
- `422` invalid setting combination.

### 8.7 Platform traffic and tenant management (platform admin only)

**Traffic:**

Inputs: time range, tenant_id (optional), endpoint (optional), rate_limit_config (for mutate).

Behavior:
- Traffic dashboard: aggregate request counts and optional latency percentiles from platform telemetry (logs or APM). Filter by tenant, endpoint, time bucket.
- Rate limits: read current limits (global or per-tenant); update only with platform_admin. Throttling changes take effect per configured rollout (e.g. next window or immediate).
- All traffic and limit changes are audited (who, what, when).

Outputs: time-series or tabular traffic data; updated rate limit acknowledgment.

Errors: `403` not platform admin; `422` invalid range or limit value; `503` telemetry unavailable.

**Tenants:**

Inputs: org_id (tenant), action (e.g. suspend | activate), reason (optional).

Behavior:
- Tenant list: read organizations with optional filters (status, created range); only platform_admin.
- Tenant health: derived from recent error rate, last activity, optional job queue depth; read-only.
- Suspend/activate: update tenant status; enforce in auth/RLS so suspended tenants cannot access app or API. Require reason and audit.

Outputs: tenant list with metadata and health; action confirmation with audit id.

Errors: `403` not platform admin; `404` tenant not found; `409` tenant already in target state.

### 8.8 Platform usage and health (read-only for platform admin)

**Usage:** Inputs: time range, tenant_id (optional), metric_type (MAU, API_calls, feature_X). Behavior: return aggregated counts or time series from usage store (e.g. events, logs). Outputs: JSON or CSV; charts in UI. Errors: `403` not platform admin.

**Health:** Inputs: service name (optional). Behavior: return status of core services (Supabase, Auth, PostgREST, Realtime, Storage) and required RPCs; optionally latency/error rate. Outputs: status list and optional metrics. Errors: `403` not platform admin.

## 9) User Interface Requirements

### Navigation and Information Architecture

The console is structured like a **SaaS platform console**: platform-level sections first (Traffic, Tenants, Usage, Health, Config), then tenant-level sections (when an org is selected). Platform sections are visible only to platform admins; tenant sections use org context and capability checks.

**Primary left navigation:**

- **Dashboard** — Platform overview (traffic summary, tenant count, health status) for platform admins; or tenant overview (org summary, quick links) for org admins.
- **Platform** (platform admin only)
  - **Traffic** — Traffic dashboard, rate limits, throttling, traffic by tenant/endpoint.
  - **Tenants** — Tenant directory, tenant health, suspend/activate, tenant drill-down.
  - **Usage & Analytics** — MAU/DAU, API calls, feature adoption, quotas.
  - **Platform Health** — System health, errors, latency, RPC/dependency status.
  - **Platform Config** — Feature flags, global limits, maintenance.
- **Access and Team** (tenant)
- **Operations** (tenant)
  - Trips
  - Indents
  - Clients
  - Suppliers
  - Drivers
  - Vehicles
- **Finance** (tenant)
  - Ledger
  - Driver Ledger
  - Reports
- **Network** (tenant)
  - Connection Requests
  - Shared Ledger
  - Disputes
- **AI Governance** (tenant)
- **Audit and Monitoring** (platform: global audit; tenant: org audit)
- **Settings** (tenant org settings; platform: console preferences)

### Key screen requirements

- **Platform dashboard:** For platform admins, landing view with traffic summary, tenant count, platform health status, and quick links to Traffic, Tenants, Usage, Health.
- **Tenant context:** When acting as org admin, clear org selector and breadcrumb so scope (platform vs tenant) is obvious.
- Global top bar: org selector (or “Platform” vs tenant), global search, user menu, alert center.
- Table-heavy screens: server pagination, sort, saved filters, CSV export.
- Detail pages: summary panel + activity timeline + related entities.
- Mutating forms: inline validation + review step + reason capture (for sensitive actions).
- Error surfaces: actionable messages, retry controls, support reference id.

### Visual design and theme (Tesla-inspired, aligned with q-mobile)

The admin console MUST use the same visual language as the q-mobile application: **Tesla-inspired**, with a **white, black, and red** palette. All colors and layout tokens MUST be derived from the single source of truth used in the mobile app so the brand and experience stay consistent across platforms.

**Source of truth (q-mobile):**

- Colors: [`constants/Theme.ts`](../constants/Theme.ts) — single source for all UI colors; no hardcoded hex in components.
- Layout: [`constants/Layout.ts`](../constants/Layout.ts) — spacing, padding, touch targets.
- Header pattern: [`components/demo/TeslaHeader.tsx`](../components/demo/TeslaHeader.tsx) and [`components/TeslaHeader.tsx`](../components/TeslaHeader.tsx) — clean top bar with title, optional subtitle, and right-side actions (e.g. globe, bell, avatar).

**Canonical palette for admin console (mirror Theme.ts):**

| Token | Hex | Usage in admin |
|-------|-----|----------------|
| **White** | `#ffffff` | Page background (`screenBackground`), header background, card surfaces, modal backgrounds. |
| **Black / near-black** | `#0f172a` (`textPrimaryDark`), `#1a1a1a` (`darkSurface`) | Primary headings, list titles, body text, table headers. |
| **Tesla red** | `#E82127` (`teslaRed`) | Primary accent: active nav item, active filter pills, FAB/primary action buttons, tab underline, negative amounts (debit/loss), destructive actions, alert dot on bell, loading spinners, selected row highlight. |
| **Dark green** | `#15803D` (`darkGreen` / `positive`) | Positive amounts (credit), success states, confirm actions. |
| **Surface grays** | `#F9F9F9`, `#F4F4F4`, `#f1f5f9` | Cards, sidebars, input backgrounds, borders. |
| **Text secondary** | `#94a3b8`, `#86868B` | Secondary labels, timestamps, placeholders, muted icons. |
| **Borders** | `#F0F0F0`, `#e2e8f0` | Dividers, table borders, input borders. |

**Where to use white, black, and red:**

- **White:** Dominant background for the entire app (main content, header bar, tables, forms). Keeps the interface clean and consistent with mobile.
- **Black:** All primary text and key headings. Optional dark strip or sidebar background (`#1a1a1a`) for contrast (e.g. left nav or top bar) if the design uses a dark chrome variant.
- **Red:** Use sparingly for emphasis: active state in navigation, primary CTA (e.g. "Save", "Approve"), negative financial values, errors/destructive actions, and notification indicators. Do not use red for large background areas; reserve it for accents and semantic highlights.

**Admin shell and header:**

- Top bar (or equivalent) MUST follow the TeslaHeader pattern: clear title (optionally uppercase, bold), optional subtitle, right-side actions (org switcher, search, notifications, user menu).
- Header background: white (`screenBackground`); bottom border: light gray (`borderLight`).
- Primary action in the header (e.g. "Layers", "Create") MAY use a pill/button with Tesla red background and white text, consistent with mobile (`backgroundColor: Theme.teslaRed`, `borderColor: Theme.screenBackground`).
- Notification/alert indicator: small red dot (Tesla red) on the bell or alert icon.

**Tables and lists:**

- Row hover: subtle surface gray; selected/active row: thin left border or background tint in Tesla red.
- Negative amounts, debit, loss, overdue: text color Tesla red.
- Positive amounts, credit: text color dark green.

**Forms and buttons:**

- Primary button: Tesla red background, white text.
- Destructive button: Tesla red outline or fill; confirm step required.
- Secondary/ghost: black text on white or gray surface; border light gray.

**Accessibility and consistency:**

- Ensure sufficient contrast (e.g. black text on white meets WCAG AA). Red is used for accent and semantics, not for long body text.
- Admin console SHOULD expose the same theme tokens (e.g. CSS variables or design tokens) mapped from `Theme.ts` so future changes in one place propagate to both mobile and web.

### Admin workflow patterns

- "Inspect -> Decide -> Act -> Verify" on all control flows.
- Confirmation modal on high-risk actions (permission changes, dispute resolution, bulk edits).
- Diff visualization for before/after on updates.

## 10) Data Model and Integration Points

### Core entities

- `organizations`, `organization_members`
- `clients`, `suppliers`, `drivers`, `vehicles`
- `indents`, `trips`
- `transactions`, `driver_ledger`
- `connection_requests`, `organization_relations`/links
- `shared_ledger_connection`, `dispute`, shared-ledger entries
- AI domain tables: `ai_settings`, `client_risk_scores`, `trip_predictions`, `vehicle_health_scores`, `cashflow_forecast`, `events`, `ai_feedback`

### Existing service and RPC dependencies

Key RPC dependencies to support in admin workflows:
- `get_organizations_for_user`
- `get_invitee_by_phone`
- `get_connection_requests_received_with_names`
- `get_connection_requests_sent_with_names`
- `get_driver_invitee_by_phone`
- `get_driver_invites_received`
- `accept_driver_invite`, `reject_driver_invite`
- `attach_driver_by_contact`
- `get_trips_where_org_is_client`
- `get_verified_balances`
- `get_shared_ledger_connections`
- `get_shared_ledger_entries`
- `accept_partner_view`

### Proposed admin API surface (backend facade)

The admin console should use explicit versioned endpoints (or equivalent RPC facade) to avoid coupling UI directly to table internals. **Platform-layer** endpoints require platform_admin; **tenant-layer** endpoints require org membership and the stated capability.

**Platform (SaaS) — traffic, tenants, usage, health, config:**
- `GET /admin/v1/platform/traffic` — Traffic metrics (volume, by tenant/endpoint, time range).
- `GET /admin/v1/platform/traffic/rate-limits` — Current rate limits (global and per-tenant).
- `PATCH /admin/v1/platform/traffic/rate-limits` — Update rate limits or throttling (audited).
- `GET /admin/v1/platform/tenants` — Tenant directory (list orgs with metadata and health).
- `GET /admin/v1/platform/tenants/{orgId}` — Single tenant detail and health.
- `POST /admin/v1/platform/tenants/{orgId}/suspend` — Suspend tenant (reason required, audited).
- `POST /admin/v1/platform/tenants/{orgId}/activate` — Activate tenant (audited).
- `GET /admin/v1/platform/usage` — Usage analytics (MAU, API calls, feature adoption, optional per-tenant).
- `GET /admin/v1/platform/health` — Platform health (services, RPCs, optional latency/errors).
- `GET /admin/v1/platform/config` — Feature flags and global limits (read).
- `PATCH /admin/v1/platform/config` — Update feature flags or global limits (audited).

**Tenant-layer (org-scoped):**

Access:
- `GET /admin/v1/orgs/{orgId}/members`
- `PATCH /admin/v1/orgs/{orgId}/members/{memberId}/capabilities`
- `POST /admin/v1/orgs/{orgId}/members/invite`

Operations:
- `GET /admin/v1/orgs/{orgId}/trips`
- `PATCH /admin/v1/orgs/{orgId}/trips/{tripId}/assignment`
- `PATCH /admin/v1/orgs/{orgId}/trips/{tripId}/status`
- `GET /admin/v1/orgs/{orgId}/entities/{entityType}`

Finance:
- `GET /admin/v1/orgs/{orgId}/ledger`
- `POST /admin/v1/orgs/{orgId}/ledger`
- `PATCH /admin/v1/orgs/{orgId}/ledger/{entryId}`
- `GET /admin/v1/orgs/{orgId}/driver-ledger`

Network and disputes:
- `GET /admin/v1/orgs/{orgId}/connections/requests`
- `POST /admin/v1/orgs/{orgId}/connections/requests/{requestId}/approve`
- `POST /admin/v1/orgs/{orgId}/connections/requests/{requestId}/reject`
- `GET /admin/v1/orgs/{orgId}/shared-ledger/balances`
- `GET /admin/v1/orgs/{orgId}/shared-ledger/entries`
- `POST /admin/v1/orgs/{orgId}/disputes`
- `POST /admin/v1/orgs/{orgId}/disputes/{disputeId}/resolve`
- `POST /admin/v1/orgs/{orgId}/shared-ledger/accept-partner-view`

AI governance:
- `GET /admin/v1/orgs/{orgId}/ai/settings`
- `PATCH /admin/v1/orgs/{orgId}/ai/settings`
- `GET /admin/v1/orgs/{orgId}/ai/actions`
- `GET /admin/v1/orgs/{orgId}/ai/report`

Audit:
- `GET /admin/v1/orgs/{orgId}/audit/events`
- `GET /admin/v1/orgs/{orgId}/audit/events/{eventId}`

### Required new backend additions for admin readiness

- Dedicated immutable `admin_audit_events` table.
- Policy-driven approval table for privileged actions (optional by org).
- Unified diagnostics endpoint for RPC and contract health.
- Consistency checks for schema drift (transactions/cash_entries compatibility mode).
- **Platform layer:** Telemetry or log aggregation for traffic (request counts by tenant/endpoint/time) and usage (MAU, API calls, feature events). Tenant status field or table (e.g. `organizations.status`: active | suspended) and enforcement in auth/RLS. Rate-limit configuration store (global and per-tenant) and integration with API gateway or application middleware.

## 11) Technical Requirements

### Recommended stack

Web application:
- Next.js + TypeScript for admin web frontend.
- Shared domain types via `packages/shared-types`.
- Supabase JS for auth/session and selected read flows.
- **Design system:** Theme and colors MUST align with q-mobile; use the same token values from `constants/Theme.ts` (e.g. export as JSON/CSS vars or import in a shared package). Tesla-inspired palette: white backgrounds, black primary text, Tesla red (`#E82127`) for accent and primary actions. See §9 Visual design and theme.

Backend/API layer:
- Preferred: server-side API facade (Next.js route handlers or dedicated service) to centralize authorization, validation, and audit.
- Avoid direct unrestricted table mutation from browser for privileged actions.

### Security architecture

- Supabase Auth with short-lived sessions and secure cookie strategy.
- Capability checks enforced server-side on every mutating endpoint.
- DB RLS remains final enforcement layer.
- Secrets managed via environment variables and runtime secret manager.
- PII and sensitive data masked by default in list views.

### Performance and scalability

- Target 95th percentile page load under 2.5s for primary list screens.
- API list endpoints support pagination, server filtering, and indexed sort.
- Asynchronous export/report jobs for large datasets.
- Caching strategy for read-heavy dashboards (short TTL + explicit invalidation).

### Observability and operability

- Structured logs for all admin API calls.
- Correlation id per request propagated to audit events.
- Error monitoring with alert thresholds by module.
- Health panel for critical RPC availability and background job status.

## 12) Non-Functional Requirements

### Security and compliance

- RBAC and least-privilege must be enforced end-to-end.
- Every mutating admin action is logged with actor, target, before/after, reason, timestamp.
- MFA enforcement option for privileged personas.
- Immutable audit retention policy (minimum 1 year, configurable).

### Reliability

- 99.9% availability target for admin critical operations.
- Graceful degradation for non-critical AI/report features.
- Idempotency keys for high-risk POST actions.

### Data integrity

- Optimistic concurrency control for updates.
- Strong validation for ledger, trip status, and dispute state transitions.
- Referential integrity checks for cross-entity operations.

### Usability

- Desktop-first responsive layout.
- Accessible forms/tables (keyboard navigation, clear error states).
- Consistent interaction patterns across modules.

## 13) Error Handling and Validation Rules

Global:
- Return structured errors: `code`, `message`, `details`, `correlation_id`.
- Distinguish user-actionable errors from system faults.

Validation highlights:
- Trip status must be in allowed status set.
- Ledger entries must satisfy one-sided amount constraint.
- Connection/dispute actions require valid pending/open state.
- Capability mutation requests must pass policy constraints.
- AI setting toggles require authorized capability and reason.

User feedback:
- Inline form field errors for validation failures.
- Toast/banner for action outcomes.
- Retry and support escalation path for transient backend failures.

## 14) Audit and Logging Requirements

### Audit event schema (minimum)

- `event_id`
- `org_id`
- `actor_user_id`
- `actor_capabilities_snapshot`
- `action_type` (e.g., `ledger.update`, `trip.assign`)
- `target_type`, `target_id`
- `before_state` (jsonb), `after_state` (jsonb)
- `reason`
- `source` (`admin_console_web`)
- `ip`, `user_agent`
- `created_at`
- `correlation_id`

### Audit coverage

Must log:
- Access and capability changes
- Connection approve/reject
- Trip assignment and status interventions
- Ledger create/update
- Dispute create/resolve
- AI settings and policy toggles
- Any bulk operation

### Operational logs

- API access log for all endpoints.
- Security events log for denied actions.
- Integration log for RPC failures and contract mismatch warnings.

## 15) Success Metrics

### Adoption and usage

- Monthly active admin users by persona.
- Percentage of critical workflows executed in admin console vs ad hoc channels.
- Team management adoption rate (capability bundles in use).

### Efficiency

- Median time to process connection requests.
- Median time to resolve shared-ledger disputes.
- Mean time to correct ledger/trip exceptions.

### Quality and risk

- Unauthorized action attempts blocked.
- Audit completeness rate (target 100% for mutating actions).
- Reduction in reconciliation mismatches over time.

### Performance and reliability

- API p95 latency by module.
- Error rate by endpoint and top failure causes.
- SLA adherence for uptime and incident response.

## 16) Phased Delivery Plan

### Phase 1 (MVP)

**Platform (SaaS) layer:**
- Traffic dashboard (request volume, by tenant/endpoint; read-only if telemetry exists).
- Tenant directory (list orgs with metadata; optional tenant health and suspend/activate if backend ready).
- Platform health (core services and RPC availability).
- Usage dashboard (MAU, API calls) if usage store or logs available.

**Tenant layer:**
- Access/team management (basic).
- Trips/indents overview and assignment interventions.
- Ledger explorer + entry update.
- Connection request management.
- Shared-ledger balance view + dispute queue.
- Baseline audit event pipeline.

### Phase 2

- **Platform:** Rate limits and throttling controls; per-tenant quotas and feature flags; usage drill-down and alerts.
- Advanced dispute workflows and self-correction actions.
- AI governance panel and action history.
- Enhanced reporting/export pipeline.
- Support diagnostics dashboard.

### Phase 3

- Bulk operations and policy automation
- Approval workflow engine for privileged actions
- Advanced anomaly detection and compliance analytics

## 17) Open Technical Decisions (To Resolve Before Build Start)

- **Platform admin identity:** How is `platform_admin` determined? (e.g. dedicated table or flag in `profiles`/`organization_members`, JWT claim, or env-based allowlist of user IDs.)
- Final admin API host pattern: same app backend facade vs dedicated admin service.
- Canonical finance storage contract strategy (`transactions` compatibility vs migration to unified naming abstraction).
- Approval workflow scope for MVP (enabled globally vs org-configurable).
- Internal support access model (read-only tenancy boundary with break-glass controls).
- **Traffic telemetry source:** Where does traffic/usage data come from for MVP? (e.g. Supabase logs, application logs, or dedicated APM/analytics; affects scope of Traffic and Usage dashboards.)

## 18) Delivery Readiness Checklist

- [ ] Confirm upstream backend RPC parity for required contracts.
- [ ] Define `admin_audit_events` schema and retention policy.
- [ ] Finalize capability bundles per persona with security sign-off.
- [ ] Finalize endpoint specs and response contracts.
- [ ] Define MVP acceptance test plan by module.
- [ ] Configure production observability and security alerting.
