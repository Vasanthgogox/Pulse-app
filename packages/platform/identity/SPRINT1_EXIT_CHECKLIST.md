# Sprint 1 Exit Checklist — Identity API v1

**Do not start Gateway (Sprint 2) until every item below passes against the real database.**

Identity v1 is frozen once this checklist is green. New endpoints ship in v1.1 or v2 only.

## Prerequisites

```bash
# From repo root — apply platform migrations
supabase db push

# Env (packages/platform/identity or CI)
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SUPABASE_ANON_KEY=...
export PULSE_JWT_SECRET=...   # min 32 chars
export PULSE_GIT_COMMIT=...   # optional, surfaced on GET /version
```

## Run checklist

```bash
# From repo root — installs all workspace members at once (single lockfile)
npm install

cd packages/contracts && npm run build
cd ../platform/observability && npm run build
cd ../testing && npm run build
cd ../identity && npm run build
npm run test:unit              # architecture + permission matrix + OpenAPI + health (no DB)
npm run test:exit-checklist    # full integration flow (real DB)
npm run test:integration       # auth security + permission enforcement
```

## Production gates (required before v1.0.0 tag)

| Gate | Verify |
|------|--------|
| Unit tests | `npm run test:unit` |
| Integration tests | `npm run test:integration` + `npm run test:exit-checklist` |
| OpenAPI compatibility | `tests/contract/openapi-compat.test.ts` — paths, status codes, operationIds |
| Permission matrix | `tests/contract/permission-matrix.test.ts` |
| Repository isolation | `tests/architecture/repository-isolation.test.ts` |
| Migration verification | Service fails fast on startup if migrations missing |
| Health / readiness | `GET /health`, `GET /ready`, `GET /version` |
| Structured logging | `@pulse/platform-observability` — `http.request` JSON per request |

## 1. Database integrity

| Step | Endpoint | Verify |
|------|----------|--------|
| Create org | `POST /organizations` | `TENANT-*`, `ORG-*` canonical IDs |
| Create BU | `POST /business-units` | `BU-*` |
| Create WH | `POST /warehouses` | `WH-*` |
| Invite | `POST /users/invite` | `INV-*`, pending status |
| Login | `POST /auth/login` | Platform JWT issued |
| Session | `GET /auth/me` | org + membership + warehouses |

Also verified in integration tests:

- Membership uniqueness (org bootstrap creates single admin membership)
- Soft-delete (`deleted_at`) hides organization from `findByCode`
- RLS blocks outsider from reading org rows

## 2. API contract verification

OpenAPI source of truth: [`oms/docs/api/identity-v1.yaml`](../../../oms/docs/api/identity-v1.yaml)

`@pulse/platform-testing` validates:

- Success envelope: `{ success, data, meta: { requestId, schemaVersion } }`
- Error envelope: `{ success: false, error: { code, message, details? } }`
- Response `data` shapes via Zod (no extra top-level fields)
- `X-Request-Id` on all API responses
- OpenAPI document matches `IDENTITY_V1_OPERATIONS` registry

## 3. Repository isolation

```bash
npm run test -- tests/architecture/repository-isolation.test.ts
```

Allowed Supabase access: `src/repositories/**` and `src/db/client.ts` only.

Routes → Validation → Service → Repository → Supabase

## 4. Authentication

Covered in `tests/integration/auth-security.test.ts`:

- Expired JWT → 401
- Invalid signature → 401
- Wrong membership → 404
- Suspended membership → 404
- Missing bearer → 401
- Duplicate invite → 409 `INVITE_ALREADY_PENDING`

## 5. Permission matrix

| Endpoint | admin | planner | operator |
|----------|-------|---------|----------|
| `POST /organizations` | bootstrap | — | — |
| `POST /users/invite` | ✅ | ❌ | ❌ |
| `POST /warehouses` | ✅ | ✅ | ❌ |
| `GET /auth/me` | ✅ | ✅ | ✅ |

Permissions are tested independently of role names via `@pulse/contracts` + HTTP enforcement tests.

## 6. Observability

`@pulse/platform-observability` middleware on every request:

```json
{
  "event": "http.request",
  "requestId": "...",
  "correlationId": "...",
  "tenantId": "...",
  "organizationId": "...",
  "membershipId": "...",
  "endpoint": "/auth/me",
  "method": "GET",
  "statusCode": 200,
  "durationMs": 42
}
```

## Identity v1 freeze

When **all production gates** pass:

1. Tag: **Identity API v1.0.0**
2. No new endpoints during Sprint 2
3. Gateway consumes frozen contract only
4. Future changes: backward-compatible only (optional fields, new endpoints)

## Then Sprint 2

Gateway remains thin: authenticate → authorize → validate command envelope → idempotency → command store → timeline → invoke service → publish event → return `CommandResult`.

No business logic in Gateway.
