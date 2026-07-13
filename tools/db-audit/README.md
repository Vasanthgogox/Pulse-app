# Pulse DBA Audit (React + Vite)

Internal DBA audit UI for `pulse_audit_actions` / `pulse_audit_verifications`.

## Run

From repo root (reads `.env` for Supabase keys):

```bash
npm run audit
```

Open http://localhost:4040

## Scripts

| Command | Description |
|---------|-------------|
| `npm run audit` | Vite dev server (HMR) |
| `npm run audit:build` | Production build → `dist/` |
| `npm run audit:preview` | Serve production build |
| `npm run audit:legacy` | Old single-file HTML server |

## Env (repo root `.env`)

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — Live DB tab + `auth.users` via Admin API

## Compare tab

`/api/table-schema` is served by the Vite plugin and runs `supabase db query` against the linked project (no RPC migration required in dev).

## Legacy

`tools/pulse_db_audit.html` + `tools/serve.js` remain as reference; new work goes in `src/`.
