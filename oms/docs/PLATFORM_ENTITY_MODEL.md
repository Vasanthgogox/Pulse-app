# Pulse Platform — Physical Entity Model (Identity)

**Purpose:** Bridge [identity-v1.yaml](./api/identity-v1.yaml) to Postgres. This is the reference for every Identity migration and service query — not an architecture overview.

**Related:** [PLATFORM_CANONICAL_MODEL.md](./PLATFORM_CANONICAL_MODEL.md) (IDs, lifecycles) · [ROADMAP.md](./ROADMAP.md) (build order)

**Schema:** `platform` — isolated from legacy `public.organizations` (fleet/commerce). Bridge via `platform.organizations.legacy_organization_id` when Commerce adopts Platform Identity in Phase 1B.

---

## Identity service boundaries

### Identity owns

| Area | Tables |
|------|--------|
| Authentication linkage | `users` → `auth.users` |
| Tenancy | `tenants`, `organizations` |
| Org structure | `business_units`, `warehouses` |
| People + access | `users`, `memberships`, `membership_warehouses` |
| Onboarding others | `invitations`, `invite_tokens` |
| Role catalog | `roles` |

### Identity does **not** own

Drivers · Customers · Suppliers · Vehicles · Products · Orders · Indents · Trips

Those belong to **Commerce** or **Execution**. Identity must not become a "people database."

---

## Entity relationship (physical)

```
Tenant (1)
   │
   │ 1:N
   ▼
Organization (1) ─────────────────────────────┐
   │                                            │
   │ 1:N                                        │ 1:N
   ▼                                            ▼
BusinessUnit                              Membership (N)
   │                                            │
   │ 0:N                                        ├── N:1 → User
   ▼                                            ├── N:1 → Role
Warehouse                                       ├── N:0..1 → BusinessUnit
   │                                            ├── status (active | suspended | revoked)
   │                                            └── N:M → Warehouse (optional scope)
   │
   └── organization_id (required)
       business_unit_id (optional)

User (1) ── N:M ── Membership ── Organization
  │
  └── auth_user_id → auth.users (1:0..1)

Invitation (N) ── Organization
  │              ├── Role
  │              └── BusinessUnit (optional)
  └── 1:N → InviteToken
```

### Cardinality summary

| Relationship | Cardinality | Notes |
|--------------|-------------|-------|
| Tenant → Organization | 1:N | Phase 1A often 1:1; multi-org per tenant is future |
| Organization → Business Unit | 1:N | Flat list, not a tree |
| Organization → Warehouse | 1:N | Warehouse may optionally reference one BU |
| Organization → Membership | 1:N | Access is always org-scoped |
| User → Membership | 1:N | Same user, multiple memberships (different BU + role) |
| Membership → Role | N:1 | Role on membership, **not** on user |
| Membership → Warehouse | N:M | Optional; empty = all warehouses in scope (org or BU) |
| User → auth.users | 1:0..1 | Platform user created on first login / invite accept |
| Invitation → InviteToken | 1:N | Multiple tokens allowed (re-send); only one unused active |

### Example: one user, two memberships

```
USR-000042
├── MEM-000101  Organization A · Planner · Business Unit West
└── MEM-000102  Organization A · Operator · Business Unit South
```

JWT carries the **active session membership** (`membershipId`), not a role column on the user.

---

## Keys: UUID vs canonical code

| Layer | Column | Used for |
|-------|--------|----------|
| **Internal PK** | `id uuid` | FK joins, RLS helpers, service internals |
| **External ID** | `code text` | APIs, logs, support, JWT claims (`ORG-000001`) |
| **Short code** | `unit_code` / `wh_code` | Human labels within org (`WEST-OPS`, `MUM-FC-01`) |
| **Auth link** | `auth_user_id uuid` | Supabase Auth only; never exposed in public API |

**Rules:**

- APIs expose `code` as `id` in JSON (see OpenAPI examples).
- `code` values are **immutable** once issued.
- UUIDs are never returned to Commerce UI unless debugging.
- Sequences: `platform.entity_counters` + `platform.next_canonical_code(prefix, width)`.

### Canonical ID formats (Identity)

| Table | `code` format | Example |
|-------|---------------|---------|
| `tenants` | `TENANT-{6}` | `TENANT-000001` |
| `organizations` | `ORG-{6}` | `ORG-000001` |
| `business_units` | `BU-{6}` | `BU-000001` |
| `warehouses` | `WH-{6}` | `WH-000123` |
| `users` | `USR-{6}` | `USR-000042` |
| `memberships` | `MEM-{6}` | `MEM-000101` |
| `invitations` | `INV-{6}` | `INV-000007` |

JWT `tenantId` = `tenants.code`. JWT `organizationId` = `organizations.code`.

---

## Table definitions

### `platform.tenants`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `code` | text UNIQUE | `TENANT-000001` |
| `name` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | Soft delete |

### `platform.organizations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `code` | text UNIQUE | `ORG-000001` |
| `tenant_id` | uuid FK → tenants | RESTRICT delete |
| `name` | text | |
| `legal_name` | text | |
| `legacy_organization_id` | uuid | Nullable FK → `public.organizations` for fleet bridge |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | Soft delete |

### `platform.business_units`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `code` | text UNIQUE | `BU-000001` |
| `organization_id` | uuid FK | RESTRICT |
| `name` | text | |
| `unit_code` | text | Short code unique per org (`WEST-OPS`) |
| `deleted_at` | timestamptz | Soft delete |

**Unique:** `(organization_id, unit_code)` WHERE `deleted_at IS NULL`

### `platform.warehouses`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `code` | text UNIQUE | `WH-000123` |
| `organization_id` | uuid FK | RESTRICT |
| `business_unit_id` | uuid FK | Nullable SET NULL on BU soft-delete |
| `name` | text | |
| `wh_code` | text | Short code unique per org |
| `address` | jsonb | `{ line1, line2, city, state, postalCode, country }` |
| `deleted_at` | timestamptz | Soft delete |

### `platform.roles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | smallserial PK | |
| `code` | text UNIQUE | `admin`, `planner`, `operator` |
| `name` | text | Display name |
| `permissions` | jsonb | Coarse capability list (Phase 1A) |
| `is_system` | boolean | Seed rows; not deletable |

**No `users.role`.** Role lives on `memberships` only.

### `platform.users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `code` | text UNIQUE | `USR-000042` |
| `auth_user_id` | uuid UNIQUE | FK → `auth.users` ON DELETE SET NULL |
| `email` | text | UNIQUE (active rows) |
| `display_name` | text | |
| `deleted_at` | timestamptz | Soft delete |

### `platform.memberships`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `code` | text UNIQUE | `MEM-000101` |
| `user_id` | uuid FK → users | RESTRICT |
| `organization_id` | uuid FK | RESTRICT |
| `business_unit_id` | uuid FK | Nullable (org-wide membership) |
| `role_id` | smallint FK → roles | RESTRICT |
| `status` | text | `active`, `suspended`, `revoked` |
| `created_at` / `updated_at` | timestamptz | |

**Unique (active):** `(user_id, organization_id, business_unit_id, role_id)` WHERE `status = 'active'` with `NULLS NOT DISTINCT` (one org-wide membership per role)

### `platform.membership_warehouses`

| Column | Type | Notes |
|--------|------|-------|
| `membership_id` | uuid FK | CASCADE on membership delete |
| `warehouse_id` | uuid FK | RESTRICT |

**PK:** `(membership_id, warehouse_id)`

Empty set = implicit access to all warehouses in membership scope (org or BU).

### `platform.invitations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `code` | text UNIQUE | `INV-000007` |
| `organization_id` | uuid FK | RESTRICT |
| `email` | text | Invitee email |
| `role_id` | smallint FK | |
| `business_unit_id` | uuid FK | Nullable |
| `invited_by_user_id` | uuid FK → users | SET NULL |
| `status` | text | `pending`, `accepted`, `expired`, `revoked` |
| `expires_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

### `platform.invite_tokens`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `invitation_id` | uuid FK | CASCADE |
| `token_hash` | text UNIQUE | SHA-256 of raw token; never store plaintext |
| `expires_at` | timestamptz | |
| `used_at` | timestamptz | Set on accept |
| `created_at` | timestamptz | |

---

## Delete rules

| Entity | Rule | Rationale |
|--------|------|-----------|
| Tenant | **RESTRICT** if organizations exist | Prevent orphan orgs |
| Organization | **SOFT DELETE** (`deleted_at`) | Audit + support history |
| Business Unit | **SOFT DELETE** | Warehouses keep `business_unit_id` until reassigned |
| Warehouse | **SOFT DELETE** | Commerce may reference by code |
| User | **SOFT DELETE** | Revoke memberships; keep audit trail |
| Membership | **Status → `revoked`** | Prefer revoke over hard delete |
| Role (system) | **RESTRICT** | Cannot delete seeded roles |
| Invitation | **Status → `expired`/`revoked`** | No hard delete in normal ops |
| InviteToken | **CASCADE** with invitation | Or expire via `expires_at` |

**Hard CASCADE** only on: `membership_warehouses` → membership, `invite_tokens` → invitation.

---

## JWT claims (session context)

Issued by Identity Service after login. Gateway validates and forwards.

```json
{
  "schemaVersion": "v1",
  "tenantId": "TENANT-000001",
  "organizationId": "ORG-000001",
  "businessUnitId": "BU-000001",
  "warehouseIds": ["WH-000123"],
  "role": "planner",
  "membershipId": "MEM-000101",
  "sub": "<auth.users uuid>"
}
```

| Claim | Source |
|-------|--------|
| `membershipId` | Active `memberships.code` — audit and permission resolution |
| `role` | `roles.code` via active membership |
| `warehouseIds` | `membership_warehouses` → `warehouses.code`, or all in scope if unset |
| `schemaVersion` | Contract version for claim evolution |

Store authorization claims in **`app_metadata`** (not user-editable `user_metadata`). Refresh token when membership changes.

---

## OpenAPI ↔ database mapping

| OpenAPI field | Database |
|---------------|----------|
| `Organization.id` | `organizations.code` |
| `BusinessUnit.id` | `business_units.code` |
| `BusinessUnit.code` | `business_units.unit_code` |
| `Warehouse.id` | `warehouses.code` |
| `Warehouse.code` | `warehouses.wh_code` |
| `CurrentUser.id` | `users.code` |
| `Invitation.id` | `invitations.code` |
| `tenantId` | `tenants.code` |
| `membershipId` | `memberships.code` |

---

## Migrations (Identity Phase 1A)

| File | Contents |
|------|----------|
| `202611060001_identity_core.sql` | Schema, counters, tenants, organizations, business_units, warehouses, users, roles, memberships, membership_warehouses |
| `202611060002_identity_invitations.sql` | invitations, invite_tokens |
| `202611060003_identity_rls.sql` | Helper functions, RLS policies, indexes |
| `202611060004_identity_seed.sql` | System roles + default permissions |

---

## Build order (after Identity)

```
Identity → Gateway → Command Store → Platform Timeline → Configuration → Reference Data → Commerce API
```

Gateway accepts external commands, validates JWT, assigns `correlationId`, enforces idempotency via Command Store, forwards to business services.

---

## Document changelog

| Date | Change |
|------|--------|
| 2026-06-29 | Initial physical model — Identity schema, memberships, JWT `membershipId` |
