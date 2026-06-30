# @pulse/platform-identity

**Sprint 1 — Identity API v1** (freeze after exit checklist passes)

## Exit checklist

See **[SPRINT1_EXIT_CHECKLIST.md](./SPRINT1_EXIT_CHECKLIST.md)** before starting Gateway (Sprint 2).

```bash
npm run test:unit              # no DB required
npm run test:exit-checklist    # real Supabase required
```

## Architecture

```
Route → Validation → Service → Repository → Database
```

No Supabase in routes. JWT stays small (no permissions). Authorization uses `authorize("permission:key")` via role→permission maps in `@pulse/contracts`.

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/auth/login` | — |
| `GET` | `/auth/me` | Platform JWT |
| `POST` | `/organizations` | Supabase bearer (bootstrap) |
| `POST` | `/business-units` | Supabase bearer + `organizations:create` |
| `POST` | `/warehouses` | Supabase bearer + `warehouses:create` |
| `POST` | `/users/invite` | Supabase bearer + `users:invite` |

## Environment

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
PULSE_JWT_SECRET=          # min 32 chars
PORT=3101                  # optional
```

## Run

```bash
# Apply migrations first (from repo root)
supabase db push

cd packages/platform/identity
npm install
npm run dev
```

## Sprint 1 Definition of Done

```text
POST /organizations      → Organization created
POST /business-units     → Business Unit created
POST /warehouses         → Warehouse created
POST /users/invite       → Invitation stored
POST /auth/login         → Platform JWT issued
GET  /auth/me            → Org, membership, warehouse context
```

Prerequisite: user must exist in Supabase Auth before `POST /organizations` (bootstrap uses Supabase access token).

## References

- Contract: [oms/docs/api/identity-v1.yaml](../../../oms/docs/api/identity-v1.yaml)
- Physical model: [oms/docs/PLATFORM_ENTITY_MODEL.md](../../../oms/docs/PLATFORM_ENTITY_MODEL.md)
- Kernel: `@pulse/contracts`
- Migrations: `supabase/migrations/202611060001`–`005`
