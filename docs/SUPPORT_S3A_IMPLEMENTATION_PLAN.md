# S3a — Admin Identity & Login: implementation plan (proposed, not applied)

**Status: plan for review. No migration written, no `platform_users` row inserted, no code
changed.** Same gate as S1/S2: this plan is presented first; nothing gets written until it's
reviewed. Scope is exactly S3a from `docs/SUPPORT_S3_IDENTITY_PLAN.md` §13 — admin login/session,
`auth.users → platform_users` mapping, protecting console access, preserving existing service-role
behavior during the transition. S3b (membership management), S3c (assignment), S3d (enforcement)
are explicitly not part of this slice.

## 1. What already exists (read-only findings, this pass)

- **`public.platform_users` / `platform_roles` / `platform_permissions` / `platform_role_members`**
  (`20261224000000_platform_iam.sql`) — schema, RLS, and seed data (3 roles, 7 permissions) are
  already live. Nothing to create there.
- **`public.get_my_platform_permissions()`** — already exists, already correctly scoped
  (`SECURITY DEFINER`, filters on `auth.uid()` + `status = 'active'`). This is already the right
  "am I a provisioned platform admin, and what can I do" hook — no new RPC needed for S3a.
- **RLS on `platform_users` already anticipates this exact bootstrap case** — its own migration
  comment says a brand-new `platform_user` must be able to read their own row via
  `user_id = auth.uid()` even with zero roles, specifically so a fresh login can discover its own
  state. No RLS change needed.
- **Email/password auth is already enabled at the project level**
  (`supabase/config.toml` → `[auth.email] enable_signup = true`, `enable_confirmations = false`),
  and the main app already uses this exact primitive
  (`features/auth/services/auth.service.ts:508`, `supabase().auth.signInWithPassword(...)`). Reusing
  it for Admin Console login is consistent with an existing convention, not a new one.
- **The anon key is already wired into `analytics/`'s build.** `analytics/vite.config.ts` already
  reads `VITE_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the repo-root `.env` (which
  already has `EXPO_PUBLIC_SUPABASE_ANON_KEY` set) and already injects it as
  `import.meta.env.VITE_SUPABASE_ANON_KEY` via `define`. **Zero `vite.config.ts` changes needed** —
  it was already prepared for this, just unused until now.
- **`analytics/src/lib/supabase.ts`** (the existing service-role client) is untouched by this plan.
  Every existing panel keeps calling it exactly as today.
- **`analytics/src/App.tsx`** has one clean insertion point: `export default function App()`
  (line 222) already branches on `supabaseConfigError` before rendering
  `<AdminDataProvider><AdminShell/></AdminDataProvider>`. A login/session gate slots in right after
  that check, before the existing render — no change inside `AdminShell` or any panel.

## 2. Exact changes proposed

### 2a. New file: `analytics/src/lib/supabaseAuth.ts`
A second, separate Supabase client — **anon key**, `persistSession: true` (unlike the existing
service-role client, which deliberately does not persist). Used only for admin login/session; never
used for data reads/writes (those stay on the service-role client per panel, unchanged).

### 2b. New file: `analytics/src/context/AdminAuthProvider.tsx` (or a small hook, e.g.
`useAdminSession.ts` — final shape TBD at code-review time, not a decision needed now)
- Subscribes to `supabaseAuth.auth.onAuthStateChange` for session state.
- Once a session exists, calls `get_my_platform_permissions()` via the **authed** client (not the
  service-role client) to learn whether this `auth.users` row is a provisioned, active
  `platform_user`, and with which permissions.
- Exposes three states: `signed_out`, `signed_in_not_provisioned` (has a session, zero platform
  permissions), `signed_in_provisioned`.

### 2c. New file: `analytics/src/components/auth/AdminLoginScreen.tsx`
Minimal email + password form calling `supabaseAuth.auth.signInWithPassword(...)` only.
**Deliberately no sign-up form** — see §4's security note.

### 2d. `analytics/src/App.tsx` — minimal edit
After the existing `supabaseConfigError` check, add:
- `signed_out` → render `AdminLoginScreen`.
- `signed_in_not_provisioned` → render a plain "Your account isn't set up for Admin Console access
  yet — contact an existing admin" screen (no dead-end error, no way to self-provision).
- `signed_in_provisioned` → render the existing `<AdminDataProvider><AdminShell/></AdminDataProvider>`
  exactly as today.

No other file changes. `AdminShell`, `Topbar`, and every panel component are untouched.

### 2e. Provisioning the first real `platform_user` — flagged as an open decision, not resolved here
Someone (you) needs to become the first row in `platform_users` with the `super_admin` role, or
none of the above ever reaches `signed_in_provisioned`. Two ways to do this, functionally
equivalent, different only in auditability:
- **(i) A migration** (`INSERT INTO platform_users ... ON CONFLICT DO NOTHING`, then
  `platform_role_members`), consistent with how the seed roles/permissions themselves were shipped
  as migration data in `20261224000000_platform_iam.sql`. Reviewable, versioned, repeatable in any
  environment.
- **(ii) A one-off manual service-role action** (SQL run once via the dashboard or CLI, not
  committed as a migration) — smaller footprint, but no versioned record of who was granted access
  and when, and not automatically replayed in another environment.
I'd lean toward (i) for the same reason S1/S2 always preferred a migration over an ad hoc write:
reviewable, reproducible, and it's the pattern already used for this exact table's seed data. Your
call before I write it either way.

## 3. What this does and doesn't change

**Changes:**
- Admin Console access as a whole (all panels, not just Support) requires a real login once this
  ships — this is what "protect console access" means literally, per your S3a scope. **Flagging
  this explicitly because it's a bigger blast radius than Support alone**: Verification, Driver
  KYC, Credits, Referrals, Reward Rules, and Boost all become unreachable without a real
  `platform_users` session the moment this lands, not just Support. If you'd rather stage this —
  e.g. gate only the Support panel first, leave the rest open during a longer transition — that's a
  smaller, equally valid alternative; say so and I'll adjust the plan before writing anything.
- One new `auth.users` row (or reuse of an existing one) becomes a real platform admin identity for
  the first time.

**Does NOT change:**
- Any panel's internal data-fetching logic — all keep using the untouched service-role client.
- Any RPC's authorization (that's S3d).
- `support_tickets.assigned_to` or any Support schema (that's S3c).
- `platform_users`/`platform_roles`/`platform_permissions` schema — only new *rows*, per §2e, no
  `ALTER TABLE`.
- Any other app (`app/`, `features/`) or `pulsetrack`.

## 4. Security notes

- `[auth.email] enable_signup = true` is a **pre-existing, unrelated** project setting (for the
  main consumer/business app's own signup flow) — not something S3a is introducing. The new
  `AdminLoginScreen` must call **only** `signInWithPassword`, never `signUp`, so the Admin Console
  doesn't expose a self-registration path into `auth.users`. (Even if it did, a fresh signup alone
  couldn't reach `signed_in_provisioned` without a `platform_users` row — but keeping the console
  sign-in-only is the correct defense-in-depth posture for an internal tool regardless.)
- The anon-key client (`supabaseAuth`) and the service-role client (`supabase`) stay strictly
  separate files/instances — no risk of the service-role key being used for a browser-facing auth
  flow, and no risk of the anon-key client being used where service-role access was intended.
  Mirrors the existing separation already documented in `analytics/src/lib/supabase.ts`'s own
  comment ("service role to bypass RLS — local/dev only; never ship publicly").
- No RLS or grant changes anywhere in this slice — everything relies on policies that already exist
  and were already reviewed when `20261224000000_platform_iam.sql` shipped.

## 5. Verification plan (once approved)

1. `npm run db:preflight` (if §2e's migration path is chosen) — confirm it's the only pending file.
2. Push, re-fetch the inserted `platform_users`/`platform_role_members` rows to confirm exact state.
3. `npm run dev` in `analytics/`, load `http://localhost:3002` with no session →
   confirm `AdminLoginScreen` renders, no panel data leaks before login (screenshot).
4. Sign in with the provisioned account → confirm `AdminShell` renders exactly as it does today,
   spot-check one or two panels to confirm zero regressions from the new gate.
5. Sign in with an account that has **no** `platform_users` row → confirm the
   "not provisioned" screen renders, not an error, not a silent fallback to the console.
6. Sign out → confirm returning to `AdminLoginScreen`, no residual access.
7. `tsc -b` (or this workspace's existing typecheck command) scoped to `analytics/`.
8. Report exact files touched + migration filename (if any) before pushing, same as every prior
   gate.

## 6. Decisions — locked (2026-08-31)

1. **§2e** — **versioned migration**, not a manual insert. Reproducible, auditable, consistent
   with how the seed roles/permissions themselves shipped. The migration inserts **only** the one
   intended bootstrap identity + its role grant — no generic admin population, no new roles or
   permissions beyond what the existing catalogue already has. Written to be safe to rerun: keyed
   off the target `auth.users.id`, `ON CONFLICT DO NOTHING` on both the `platform_users` insert
   (unique on `user_id`) and the `platform_role_members` insert (composite PK on
   `(platform_user_id, role_id)`) — rerunning the migration cannot create a second identity or a
   duplicate role grant for the same person.
2. **§3** — **gate the entire console**, not Support-only. Once this ships, Verification, Driver
   KYC, Credits, Referrals, Reward Rules, Boost, and Support all require a real
   `platform_users` session to be viewed at all. Explicitly **authentication only, not
   authorization**: every panel's own data calls keep using the untouched service-role client
   exactly as today; no panel gains a new permission check as a side effect of this gate. That
   redesign is S3b/S3d's job, not S3a's.
3. Login screen copy/branding — no decision needed, kept minimal and consistent with the console's
   existing shadcn/Tailwind style.

## 7. Blocking input required before the migration is written

**Which existing `auth.users` account becomes the first Admin Console / `platform_users` identity?**
Per your explicit instruction, this is a required input, not something to infer from an email
pattern or name. I need one of:
- The exact email address of the `auth.users` account (I'll resolve it to a `user_id` via a
  read-only lookup and show you the resolved id/email/created-at before writing anything), or
- The `auth.users.id` (UUID) directly, if you already have it.

The migration also grants that identity a platform role. The existing catalogue has three:
`super_admin` (all permissions), `control_tower` (verification + credits), `reach_admin` (Reach +
analytics). For a first Admin Console identity that needs to reach every panel (Verification,
Driver KYC, Credits, Referrals, Reward Rules, Boost, Support), `super_admin` is the only one of the
three that actually covers all of them — flagging this as the implied choice rather than deciding
it silently; say so if you want something narrower.

---

**Stopping here.** Nothing written. Waiting on §7's account identifier before the migration is
drafted. Once that's provided, next step is: resolve it read-only, show you the exact resolved
identity for confirmation, then write the migration + the three S3a code files (§2a–§2d) for
review before any push.
