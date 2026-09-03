# Dev URLs & ports

Local URLs for Pulse apps and tooling. Use this as the quick map when spinning up services.

## Quick reference

| Service | URL | Port | Start command |
|---------|-----|------|---------------|
| Pulse web (Expo / Metro) | http://localhost:8081 | **8081** | `npm run web` or `npm run dev` |
| Pulse + Commerce + Ops (combined) | http://localhost:8081 (+ `/oms`, `/admin` proxied) | **8081** + **3004** + **3002** | `npm run dev` |
| Commerce / OMS (Vite, direct) | http://127.0.0.1:3004/oms/ | **3004** | `npm run oms:dev` |
| Commerce via Pulse proxy | http://localhost:8081/oms/ | *(proxied → 3004)* | `npm run dev` |
| Ops console via Pulse proxy | http://localhost:8081/admin | *(proxied → 3002)* | `npm run dev` |
| Ops console / Analytics (direct) | http://127.0.0.1:3002/admin/ | **3002** | `npm run admin:dev` |
| DB Audit UI | http://localhost:4040 | **4040** | `npm run audit` |
| Playwright HTML report | *(opens after tests)* | — | `npm run test:web:report` |

### Local Supabase (`npx supabase start`)

| Service | URL | Port |
|---------|-----|------|
| API | http://127.0.0.1:54321 | **54321** |
| GraphQL | http://127.0.0.1:54321/graphql/v1 | **54321** |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | **54322** |
| Studio | http://127.0.0.1:54323 | **54323** |
| Inbucket (local email) | http://127.0.0.1:54324 | **54324** |
| Analytics (Supabase) | — | **54327** |
| Shadow DB (diff) | — | **54320** |
| Pooler (if enabled) | — | **54329** |
| Edge Functions | http://127.0.0.1:54321/functions/v1/<name> | **54321** |

Keys: `npx supabase status`. App env: see [LOCAL_SUPABASE.md](./LOCAL_SUPABASE.md).

---

## Apps in detail

### Pulse web — `:8081`

Main Expo Router app (web).

```bash
npm run web          # Expo web only
npm run web:clean    # Clear Metro cache, then web
npm run dev          # Commerce first, then Pulse web (recommended for /oms)
npm run dev:web-only # Pulse web without waiting on OMS
```

Metro may also bind **8082–8085** / Expo Go **19000–19002** if 8081 is taken. Free them with `npm run clean:metro`.

### Commerce / OMS — `:3004`

Vite SPA under `oms/`, base path `/oms/`.

```bash
npm run oms:dev
# or
npm run dev   # starts OMS then proxies /oms/* from :8081 → :3004
```

| Env override | Default |
|--------------|---------|
| `OMS_DEV_PORT` | `3004` |
| `OMS_DEV_HOST` | `127.0.0.1` |

Optional: `VITE_EXECUTION_API_URL=http://localhost:4000` (execution API when that service is running). See `oms/.env.example`.

### Ops / Admin console (analytics) — `:3002`

Vite app under `analytics/`. Dev base path is `/admin/` so Metro can proxy it
onto the Pulse origin; production keeps the obscured `/ops-9f3a2c/` base.

```bash
npm run dev         # starts OMS + Ops, then Pulse web (recommended)
npm run admin:dev   # Ops console only
```

Open: **http://localhost:8081/admin** (or direct: http://127.0.0.1:3002/admin/)

| Env override | Default |
|--------------|---------|
| `ADMIN_DEV_PORT` | `3002` |
| `ADMIN_DEV_HOST` | `127.0.0.1` |
| `ADMIN_DEV_BASE` | `/admin/` |

Production build is copied to `dist/ops-9f3a2c` via `npm run build:admin`.
Netlify serves it from **both** paths (200 rewrites, see `netlify.toml`):

| Path | Purpose |
|------|---------|
| `/admin/*` | Canonical — same URL shape as dev |
| `/ops-9f3a2c/*` | Original path, kept so existing bookmarks work |

Deep links and refreshes work on both (`/admin/support`, `/ops-9f3a2c/support`).
Assets stay at `/ops-9f3a2c/assets/*` — real files, served before any rewrite.

`/admin` is a convenience path, **not** a security boundary: access control is
`AdminAuthProvider` + `get_my_platform_permissions()` / RLS.

### DB Audit — `:4040`

Internal DBA audit UI (`tools/db-audit`). Reads root `.env` for Supabase keys.

```bash
npm run audit           # Vite HMR → http://localhost:4040
npm run audit:preview   # production build preview (same port)
npm run audit:legacy    # old HTML server (same port)
```

| Env override | Default |
|--------------|---------|
| `AUDIT_PORT` | `4040` |

Details: [tools/db-audit/README.md](../tools/db-audit/README.md).

---

## Port map (by number)

| Port | Owner |
|------|--------|
| 3002 | Ops / admin console (`analytics`) |
| 3004 | Commerce / OMS (`oms`) |
| 4000 | Execution API (optional; OMS env) |
| 4040 | DB Audit (`tools/db-audit`) |
| 8081 | Pulse web (Expo Metro) |
| 8082–8085 | Metro fallback / leftover packagers |
| 19000–19002 | Expo Go / tunnel helpers |
| 54320 | Supabase shadow DB |
| 54321 | Supabase API + edge functions |
| 54322 | Postgres |
| 54323 | Supabase Studio |
| 54324 | Inbucket |
| 54327 | Supabase analytics |
| 54329 | DB pooler (if enabled) |

---

## Related docs

- [commands.md](./commands.md) — npm scripts
- [LOCAL_SUPABASE.md](./LOCAL_SUPABASE.md) — local vs cloud Supabase
- [local-vs-cloud-supabase.md](./local-vs-cloud-supabase.md) — switching targets
- [DEPLOY_EDGE_FUNCTIONS.md](./DEPLOY_EDGE_FUNCTIONS.md) — functions URLs
