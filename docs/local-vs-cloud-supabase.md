# Local (Docker) Supabase vs Cloud Supabase — how switching works

## The three environments involved

| Environment      | Where it runs                | Config source          | Who uses it |
|-------------------|------------------------------|-------------------------|-------------|
| Local dev (Docker) | Your Mac, via `supabase start` | `.env.local`            | You, day-to-day coding |
| Cloud dev/staging  | Supabase's servers            | `.env`                  | Fallback / shared dev DB |
| Production (Netlify)| Supabase's servers (same project or a separate prod project) | Netlify's own env var UI (`process.env`, injected at build time, `CI=true`) | Live users |

These three never mix by accident — see "why it's safe" below.

---

## How the toggle actually works (already built into this repo)

`app.config.js` resolves `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in this priority order:

1. **`.env.local`** — if this file exists, it wins. Always.
2. **`.env`** — used if `.env.local` doesn't exist or doesn't set the var.
3. **`process.env`** — only when `CI=true` (this is how Netlify injects its own dashboard-configured values at build time; no `.env` files exist on Netlify's build server).

`.env.local` is gitignored — it is a personal, per-developer override file. It is never committed, never deployed, and Netlify never sees it.

So:
- **To use local Docker Supabase** → create `.env.local` pointing at your local instance.
- **To use cloud Supabase from your machine** → delete or rename `.env.local`; you fall back to `.env` (which already points at the hosted project).
- **Production on Netlify** → entirely unaffected by either file. Netlify has its own env vars set in its dashboard, injected as real `process.env` vars during its build (`CI=true` there), completely separate from your laptop's files.

This means: **you cannot accidentally break production by editing `.env.local`.** It only affects your local machine.

---

## Step-by-step: switch TO local Docker Supabase

```bash
# 1. Start the local stack (first time pulls Docker images, ~few min; after that, seconds)
supabase start

# 2. Get the local URL + anon key
supabase status -o env
```

Create `.env.local` in the project root (copy from `.env.local.example`):

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from supabase status>
```

> Note: `http://127.0.0.1:54321` only works when running the app in a normal web browser or iOS simulator on the same Mac.
> - Android emulator → use `http://10.0.2.2:54321` instead
> - Physical device → use `http://<your-mac-lan-ip>:54321` (find it with `ipconfig getifaddr en0`)

```bash
# 3. Restart your dev server so it picks up the new .env.local
npm run web
```

You're now developing against the local Postgres/Auth/Storage running in Docker on your Mac — safe to break things, `supabase db reset` wipes and reapplies migrations + seed data any time.

---

## Step-by-step: switch BACK to cloud Supabase

```bash
rm .env.local
npm run web
```

That's it — `app.config.js` falls back to `.env`, which already has your real project's URL/anon key.

(Optional) Stop the local containers if you don't need them running:
```bash
supabase stop
```

---

## How this interacts with the Docker web-build setup (`Dockerfile` at repo root)

That Dockerfile is unrelated to this local Supabase stack — it containerizes the **built web app** (static export), not a database. If you ever build that image locally while `.env.local` exists, remember:

- The Dockerfile's build step writes its own `.env` file from `--build-arg` values (see `Dockerfile`) — it does **not** read your `.env.local` at all.
- So building that image always uses whatever URL/key you pass as `--build-arg`, regardless of what your local dev server is currently pointed at.
- If you want that Docker image to talk to your local Supabase (rare — mostly you'd point it at cloud), you'd need to pass the local URL as a build-arg, and note that `127.0.0.1` inside a container refers to the container itself, not your Mac — you'd need `host.docker.internal` instead.

In short: **local Supabase toggle (`.env.local`) is a pure app-level dev convenience. The web-build Docker image is a separate concern (packaging the UI for potential AWS/hosting use) and always needs explicit build-args regardless of your local `.env.local` state.**

---

## Quick reference

| I want to...                                | Command / action |
|-----------------------------------------------|-------------------|
| Start local Supabase (Docker)                  | `supabase start` |
| Stop local Supabase                            | `supabase stop` |
| See local URLs/keys again                      | `supabase status` |
| Wipe local DB and reapply migrations + seed    | `supabase db reset` |
| Point app at local Supabase                    | create `.env.local` (see above) |
| Point app back at cloud Supabase               | `rm .env.local` |
| Check which one is currently active            | look at console log: `[pulse][config] resolved Supabase host: ...` printed on app start |
