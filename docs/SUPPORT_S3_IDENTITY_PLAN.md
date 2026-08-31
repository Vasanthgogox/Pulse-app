# Support S3 — Admin Console Identity & Access + Support Assignment (discovery, no code)

**Status: ARCHITECTURE LOCKED (2026-08-31).** S3a–S3d approved as four independently-deployable
steps, each gated the same way S1/S2 were (implementation plan presented and reviewed before any
migration). No migrations, users, fixtures, or `assigned_to` changes made yet — S3a implementation
planning is in progress; see `docs/SUPPORT_S3A_IMPLEMENTATION_PLAN.md` once written.
Everything below came from reading live code, live migrations, and read-only DB queries
(`pg_get_functiondef`, `information_schema`, row counts, FK inspection, repo-wide grep) against the
linked project — the same discipline used for every prior gate this session.

**Revision note:** this doc originally recommended `public.platform_users` as the identity store
for internal Admin Console operators, and treated that as effectively settled. That was corrected
mid-discovery — the risk was conflating "a table named `platform_*`" with "the correct concept for
internal-admin identity," without independently verifying the two are actually the same thing. This
revision replaces that assumption with verified evidence (§1b–§1c), locks the corrected
Business-identity-vs-Admin-identity split, renames S3's scope, and restates §12 as the four-part
sequence (S3a–S3d) covering admin identity, admin membership management, support assignment, and
enforcement — not just assignment alone.

## Headline finding

Three separately-named "platform" things exist in this codebase. Only one of them is the internal
Admin-staff identity concept Support needs. Verified, not assumed:

| Concept | What it actually is | Rows today |
|---|---|---|
| `public.platform_users` / `platform_roles` / `platform_permissions` / `has_platform_permission()` (`20261224000000_platform_iam.sql`) | **Cross-tenant internal-staff identity/authorization.** Real, live, already the authorization gate for driver KYC review, Reach campaigns, credits, Boost Control Center. Structurally independent of any organization. **This is the Admin Console identity system.** | 0 |
| `platform.users` / `platform.memberships` (Postgres **schema** `platform`, `20261106000100_identity_core.sql`) | The SQL backing for the existing **Platform Identity Service** (`lib/platform-identity/`, `docs/architecture/PLATFORM_IDENTITY.md`) — a *tenant/business* entity model (tenants → organizations → business units → warehouses → users → memberships) meant to eventually bridge/replace `public.organizations`. Confirmed by its own header comment ("Physical model: `oms/docs/PLATFORM_ENTITY_MODEL.md`... Legacy fleet/commerce continues on `public.organizations` until bridged") and by `features/organization/utils/platformIdentityShadowCheck.util.ts`, which shadow-compares it against `public.organizations` — i.e. a dormant future **business**-identity replacement, unrelated to internal staff. | 0 |
| `control-tower/` | Referenced only in `20261224000000_platform_iam.sql`'s header comment as an intended future login surface. Confirmed (git history across all branches/tags, `docs/decisions.md`) to be a **named-but-never-built** future initiative — not a lost app. | n/a |

The naming collision is coincidental: two different teams/phases both used the word "platform" —
one for a future *business*-identity model, one for *internal-staff* identity/authorization. They
share no tables, no FKs, and no code path. `public.platform_users` is the one that matters for
Support/Admin Console identity; `platform.users` (schema-qualified) is not relevant to this
decision at all — it's the shadow-mode successor to `organization_members`, i.e. Business identity,
not Admin identity.

**A complete, real, already-live cross-tenant staff identity/permission system already exists —
`public.platform_users` / `platform_roles` / `platform_permissions` / `has_platform_permission()` —
and it is genuinely used as the authorization gate in several real RPCs today (driver KYC review,
Reach campaigns, credits, Boost Control Center). It is not a stub or a dead placeholder.** But
**`platform_users` has zero rows** — no real person has ever been granted a platform role. Every
one of those RPCs is exercised today exclusively through a service-role bypass baked into their own
authorization helpers, never through the real permission branch. Support/Admin Console access would
be the **first real-world activation** of infrastructure that already exists but has never been
exercised end-to-end.

This is the single most important fact for the identity decision: you don't need to invent a
cross-tenant staff identity system. You need to decide how to activate the one that already exists
— for **Admin Console access generally**, not just for Support ticket assignment.

---

## 1. Current-state inventory

### 1a. How `analytics/` (the Admin Console) authenticates today

It doesn't. `analytics/src/lib/supabase.ts` creates a client with the **service_role key**
directly (`VITE_SUPABASE_SERVICE_ROLE_KEY`, loaded from repo-root `.env`) and
`persistSession: false`. There is no login screen, no `auth.uid()`, no session of any kind. Every
existing panel (Verification, Driver KYC, Credits, Referrals, Reward Rules, Boost Control Center,
and now Support) runs under this same client. `App.tsx`'s only gate is
`supabaseConfigError` — a check that the env var is *present*, not that anyone is *authenticated*.

### 1b. Two separate identity systems already exist in this codebase, easy to conflate

| System | Scope | Table(s) | Used for |
|---|---|---|---|
| **Platform Identity Service** (`lib/platform-identity/`, `docs/architecture/PLATFORM_IDENTITY.md`) | **Tenant-relative** — a Person's Membership *within an organization* (relationshipType, role, employment) | `organization_members` and friends | Regular Pulse users: drivers, business staff, fleet owners |
| **Platform IAM** (`20261224000000_platform_iam.sql`) | **Cross-tenant** — Pulse/GoGoX's own internal staff, not tied to any organization | `platform_users`, `platform_roles`, `platform_permissions`, `platform_role_permissions`, `platform_role_members`, `platform_events` | Control Tower reviewers, Reach admins — i.e. exactly what a Support Agent is |

**Support Agents are the second kind, not the first.** The `'SUPPORT'` / `'Support Agent'`
literals found during S2 discovery (`lib/onboarding/membershipTypes.ts`) belong to the *tenant*
system — they model "a member of a specific organization with a support-flavored relationship,"
which is the wrong shape entirely for a cross-tenant internal reviewer. That's a red herring for
S3, not a head start — noting it here so it doesn't get revisited later as if it were promising.

**Verified, not assumed, that `platform_users` is isolated from business identity:**
1. `grep -rln "platform_users" --include="*.ts" --include="*.tsx" --include="*.sql" .` (excluding
   `node_modules`) — the only matches are the 3 migration files that define/seed it. **Zero**
   references in any business/tenant-facing TypeScript code.
2. `grep -rl "platform_users\|platform_role_members" features/auth/ features/organization/
   lib/onboarding/ lib/platform-identity/` — **zero results.** No business signup/onboarding flow
   touches Platform IAM tables.
3. Live schema inspection: `platform_users.user_id` has a direct `UNIQUE ... REFERENCES
   auth.users(id) ON DELETE CASCADE`; `platform_role_members.platform_user_id → platform_users.id`.
   **No FK to `organization_members` or `organizations` anywhere in the chain.** `platform_users` is
   a fully independent identity space hanging directly off `auth.users` — structurally exactly the
   "shared `auth.users`, separate authorization domains" model: a person's row in `auth.users` can
   have a Business identity (via `organization_members`), an Admin identity (via `platform_users`),
   both, or neither — and holding one implies nothing about the other.

This confirms the corrected model precisely:

```
auth.users
   ├── Business identity  → organization_members → org/business roles & permissions
   └── Admin identity      → platform_users → platform_roles → platform_permissions → Admin Console
```

A person can exist in both worlds. Business membership does not grant Admin Console access, and
vice versa — they are read from different tables with no FK linking them.

### 1c. The Platform IAM schema, precisely

```sql
platform_users            (id, user_id → auth.users, status, employee_id, department)
platform_roles            (id, name, description)                          -- e.g. 'control_tower'
platform_permissions      (id, key, description)                           -- e.g. 'driver_kyc.review'
platform_role_permissions (role_id, permission_id)                         -- many-to-many
platform_role_members     (platform_user_id, role_id, granted_at, granted_by)
platform_events           (id, event_type, org_id, actor_user_id, payload) -- append-only audit log
```

Current live data: 3 roles (`super_admin`, `control_tower`, `reach_admin`), 8 permissions
(`analytics.view`, `credits.issue`, `credits.reverse`, `driver_kyc.review`, `reach.approve`,
`reach.manage`, `verification.approve`, `verification.review`) — **and zero `platform_users` rows.**

Writes to all five tables are service_role-only by design (no INSERT/UPDATE/DELETE policy for
`authenticated`/`anon`) — granting a platform role today is explicitly an ops action via the
dashboard/service key, not a self-service app action. That convention would carry over to Support
agents unchanged.

### 1d. The exact bridge pattern that already reconciles service_role with real permissions

This is the reusable pattern the whole recommendation rests on — found in
`can_review_driver_kyc()`, the real helper `platform_review_driver_kyc_submission()` (the RPC
`analytics/`'s `DriverKycPanel` actually calls) uses:

```sql
CREATE OR REPLACE FUNCTION public.can_review_driver_kyc()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  select
    -- Trusted server-side caller (admin console service-role key, backend
    -- job). Not reachable from an anon or authenticated browser client.
    current_user = 'service_role'
    or current_setting('role', true) = 'service_role'
    or public.has_platform_permission((select auth.uid()), 'driver_kyc.review');
$$;
```

Today, every real call through this function takes the `service_role` branch (since
`platform_users` is empty, the `has_platform_permission` branch can never be true yet regardless).
**This is exactly the mechanism that would let Support activate real identity incrementally,
without a flag-day cutover**: ship a Support-scoped equivalent now, `analytics/`'s existing
service-role calls keep working unchanged, and the real-permission branch simply starts being
exercised the day a real login path exists and someone is actually granted a role. No migration
of existing behavior required to introduce the check.

One honest caveat on attribution: even in this KYC RPC, `reviewed_by = (select auth.uid())` is
`NULL` today for every real decision, because the caller is always the service_role branch. Real
attribution requires a real session — the permission check alone doesn't produce it. This applies
identically to Support.

### 1e. `control-tower/` — resolved, nothing to resurrect

The Platform IAM migration's own header comment says it "backs the new `control-tower/` app (real
Supabase Auth login)." Confirmed by exhaustive investigation (git log across every branch, tag, and
commit message in this repo — zero results; `docs/decisions.md` grep) that **`control-tower/` never
existed as a built app.** "Control Tower" appears in `docs/decisions.md` as a planned, not-yet-
started future Growth Platform initiative name, explicitly sequenced after other work — not a lost
or removed app. Nothing to resurrect. `analytics/` is the Admin Console; Admin Console identity work
happens there.

---

## 2. Reusable patterns found (summary)

- **Identity table**: `platform_users`, keyed to `auth.users.id`, already has the right shape
  (`status`, `employee_id`, `department`) for a Support Agent roster — no new identity table
  needed.
- **Role/permission model**: `platform_roles`/`platform_permissions`/`platform_role_permissions`
  is already a real RBAC system — a `support_agent` role + `support.reply`/`support.manage`
  permissions slot in exactly like `control_tower`/`driver_kyc.review` did.
- **Authorization bridge**: `can_review_driver_kyc()`'s service_role-OR-real-permission pattern is
  directly reusable for a `can_manage_support_tickets()` equivalent.
- **Audit log**: `platform_events` (`actor_user_id`, `event_type`, `payload`) is a ready-made
  cross-module audit trail — though Support already has its own `support_ticket_activity` table
  from S1, which is ticket-scoped and arguably the more useful place for ticket-specific history
  to keep living (see §10).
- **Grant convention**: platform role membership is service_role/ops-only to write, matching how
  you'd want Support Agent grants handled too (not a self-service "make yourself an agent" flow).

## 3. Options

### Option A — Support-specific authentication layer
A bespoke login/identity path just for Support, independent of Platform IAM.
- ❌ Would duplicate the identity/role/permission modeling Platform IAM already provides.
- ❌ Creates a second, parallel "who is internal staff" concept alongside one that already exists.
- Only argument for it: zero risk of touching anything else. But given Platform IAM's tables have
  zero existing consumers with real data, that isolation is already available for free under
  Option B too (see below) — A doesn't actually buy you much once B's incrementality is priced in.

### Option B — Platform IAM, activated for Admin Console + Support (recommended, and now the
locked direction per your review)
Reuse `platform_users`/`platform_roles`/`platform_permissions`/`has_platform_permission()`
exactly as designed — as the **general Admin Console identity/authorization mechanism**, with
Support assignment as its first real consumer. Add role(s)/permission(s) for Support from the
existing catalogue-extension pattern (see §7's naming note), a `can_manage_support_tickets()`
bridge function mirroring `can_review_driver_kyc()`, and a real `assigned_to → platform_users.id`
FK — **confirmed, per §1b/Headline finding, to be a clean Admin-identity target, structurally
independent of `organization_members`/business identity.**
- ✅ Zero new identity concepts — reuses a system already purpose-built for exactly this
  (cross-tenant internal staff), now verified (not just self-described) to be isolated from
  business/product identity.
- ✅ Directly consistent with where your broader architecture already points — both Platform IAM's
  own design and the Admin Console PRD's "Platform Admin bundle, separate from org membership"
  independently converge on this.
- ✅ The service_role bridge means **this can ship without breaking `analytics/`'s current
  access model for anything** — existing panels keep working exactly as they do now during the
  transition to real login.
- ✅ Scoped correctly this time: this is Admin Console identity generally (S3a/S3b), with Support
  assignment (S3c) and RPC-level enforcement (S3d) as the concrete first uses — not a Support-only
  side system.
- ⚠️ You'd be the first real consumer of a dormant system — the schema is real, but there's no
  production track record of `platform_users`/`has_platform_permission` working end-to-end with
  an actual logged-in staff member yet.

### Option C — full Admin Console rewrite to real per-admin auth for every panel
Swap `analytics/`'s service_role client for a real authenticated one everywhere, write RLS for
every table every panel touches (Verification, Driver KYC, Credits, Referrals, Reward Rules,
Boost).
- ❌ This is the "huge rewrite" you explicitly wanted to avoid, and nothing in Support requires
  it — the bridge pattern in §1d means Support doesn't need the *rest* of the console to change
  at all to get real Support-agent identity.
- Not recommended as part of S3. Worth knowing that if the console-wide rewrite ever happens
  later for other reasons, Support would already be compatible with it (same `has_platform_permission`
  primitive), not something to redo.

## 4. Where does real login happen? — resolved: `analytics/` gets a real Admin Console login

With §1e resolved (no `control-tower/` to find or rebuild), this is no longer a three-way fork —
it's a single answer: **`analytics/` becomes the real Admin Console, and gets a real login of its
own.** This is also independently what the console PRD (`docs/ADMIN_CONSOLE_WEB_PRD.md`) assumes —
its RBAC section calls for "a Platform Admin bundle... separate from org membership," i.e. exactly
`platform_users`/`platform_roles` fronted by a real session, not a service-role-only tool forever.

Concretely, and important for scope: this is now framed as **Admin Console identity**, not
"Support's own login." A minimal real-auth login is added to `analytics/` (email/password or
whatever this project's internal-staff login convention should be — not yet decided) that maps a
real `auth.users` session to a `platform_users` row. Every *existing* panel's current service_role
client stays exactly as-is during the transition — nothing about Verification, Driver KYC, Credits,
Referrals, Reward Rules, or Boost changes as a side effect of adding login. Support is simply the
first panel whose write paths are gated behind the new real-session check, via the same
service-role-OR-real-permission bridge pattern already used elsewhere (§1d).

This is now **S3a** in the sequence (§13), not a side question — see there for the exact scope.

## 5. Support Agent vs Support Admin — do not equate

`docs/ADMIN_CONSOLE_WEB_PRD.md` defines "Persona F — Support Admin (Internal)" as broader than
ticket handling: it includes scoped, impersonation-safe diagnostics and read-heavy troubleshooting
across tenant orgs, not just replying to and assigning Support tickets. **This plan's scope is
narrower than that persona, and that's deliberate — don't build toward Persona F's full surface as
part of S3.** Concretely:

- **Support Agent** (this plan's scope): can view/reply/assign tickets — the operations S1/S2
  already built the write paths for.
- **Support Admin** (the PRD's Persona F, broader, out of scope for S3): the above, plus
  diagnostics/troubleshooting tooling that doesn't exist yet anywhere in the Admin Console.

Treat "Support Agent" as one possible role among several the new Admin Console identity/permission
system will eventually support (§9's S3b membership management is what makes that extensible), not
as a synonym for "whoever has Admin Console access." A future Persona F build should reuse the same
`platform_users`/`platform_roles`/`platform_permissions` foundation this plan establishes, not a
separate one — but defining its permissions is explicitly not part of S3.

**On permission naming:** any permission keys used below (`support.reply`, `support.assign`, etc.)
are illustrative, not decided. `platform_permissions` is a real, live catalogue (currently 8 rows —
`analytics.view`, `credits.issue`, `credits.reverse`, `driver_kyc.review`, `reach.approve`,
`reach.manage`, `verification.approve`, `verification.review`). Before any migration, re-check that
catalogue and name new permissions consistently with its existing convention (`<domain>.<verb>`)
rather than inventing a naming scheme fresh.

## 6. Security implications

- Platform IAM tables are already RLS-correct for reads (self-or-staff) and write-locked to
  service_role — nothing to hardstop for reuse.
- The service_role-OR-permission bridge pattern (§1d) is *already* the accepted risk posture in
  this codebase (driver KYC, Reach, credits, Boost all use it) — adopting it for Support is
  consistent with, not a deviation from, existing practice.
- Whichever login path is chosen (§4), it must not weaken today's stance: `analytics/`'s
  service_role key must never reach a public bundle, and a Support-specific real-auth client (if
  built) uses the anon key + real Supabase Auth exactly like the main app already does — no new
  secret-handling risk.
- `assigned_to → platform_users.id` (not directly `auth.users.id`) keeps a clean boundary: a
  person must be a *platform user* (vetted, ops-granted) before they can ever be an assignee, not
  merely "any authenticated Supabase user." Matches how `platform_role_members` already works.

## 7. Recommended architecture (for your decision, not yet built)

```
Admin Console (analytics/)
   ├── Every existing panel → service_role client, UNCHANGED
   └── Support panel → (new) real-auth client for write actions
             ↓
       Supabase Auth session (real login, scope TBD by §4)
             ↓
       platform_users  (Support Agent = a platform_user with the 'support_agent' role)
             ↓
       can_manage_support_tickets()  — service_role OR has_platform_permission bridge
             ↓
       support_tickets.assigned_to → platform_users.id
             ↓
       support_ticket_activity.actor_user_id populated for real (once real session exists)
```

## 8. Exact database changes (proposed, not applied), grouped by which S3 sub-phase they belong to

**S3a — Admin identity:**
- New Supabase Auth users for real staff (or an invite flow — see S3b) mapped 1:1 to `platform_users`
  via its existing `user_id → auth.users` FK. No new table needed; this is *provisioning*, not schema.
- `can_access_admin_console()` (or similarly-scoped) bridge function, `service_role OR
  has_platform_permission(...)`, mirroring `can_review_driver_kyc()` — the general console-entry
  gate, separate from any single feature's permission.

**S3b — Admin membership management:**
- No new tables — `platform_users`/`platform_roles`/`platform_role_members` already model exactly
  "invite an internal person, assign them a role, activate/deactivate them." This phase is really
  about *using* the existing tables via new RPCs/UI (invite, activate, deactivate, change role),
  not adding schema.
- Possibly a new RPC or two for self-service invite/activation if that flow doesn't already have
  an equivalent — to be confirmed against what already exists before assuming it needs building.

**S3c — Support assignment:**
- `INSERT INTO platform_permissions (...)` for Support-specific permissions, named per §5's
  catalogue-consistency note (not `support_agent`/`support.reply` as fixed decisions — illustrative
  only until checked against the live catalogue).
- New function `can_manage_support_tickets()`, textually mirroring `can_review_driver_kyc()`.
- `support_tickets.assigned_to` **already exists** (nullable, S1, unconstrained on purpose) — add
  `REFERENCES platform_users(id)` as a real FK now that the target concept is confirmed correct.
- New RPC `admin_assign_support_ticket(ticket_id, platform_user_id)`.
- `support_ticket_activity.actor_user_id` — no schema change; already nullable from S1; starts
  getting populated with `(select auth.uid())` → resolved to a `platform_users` row once real
  sessions exist, same pattern as `reviewed_by` for driver KYC today.

**S3d — Enforcement:**
- Update the four existing S2 admin RPCs' authorization to require the relevant
  `has_platform_permission()` check via their own bridge function, not merely `GRANT ... TO
  service_role` — i.e. real backend enforcement, not just hiding buttons in the UI. Additive: the
  service_role grant stays as a second layer during the transition, not replaced outright.

## 9. Exact Admin Console changes (proposed, not applied)

- A real-auth Supabase client/session for `analytics/` as a whole (S3a) — not Support-scoped. Every
  *other* existing panel's current service_role client stays exactly as-is during the transition;
  this only adds the capability, it doesn't force every panel to switch on day one.
- A minimal login UI (email/password or whatever this project's internal-staff login convention
  should be — not yet decided, see §4).
- An internal member-management UI (S3b): list `platform_users`, invite/activate/deactivate, assign
  a role — "this is where different internal users eventually get different feature access through
  the existing capability model," not a Support-only concern.
- `SupportPanel.tsx` (S3c): an "Assign" action (dropdown of `platform_users` with the relevant
  role), an "Assigned to me" quick action once a real session exists, and activity-log rows that
  show a real name instead of nothing.
- No changes to any other panel's own screen/logic — only its underlying auth path becomes capable
  of real sessions (S3a), which is opt-in per panel, not forced.

## 10. Assignment lifecycle (proposed)

```
Unassigned  →  Assign to Agent  →  Assigned to <name>  →  Reassign  →  Unassigned
```

- Assignment and status change **independently** — assigning a ticket does not force
  `status → assigned`. The `assigned` status value stays exactly what it's been since S1: a real,
  selectable status with no automatic trigger. Recommendation: leave that decoupled rather than
  auto-transition, since an agent might pick up an `in_progress` ticket someone else was already
  working, and forcing it back to `assigned` would lose information. This mirrors your own S1/S2
  instinct to keep `assigned_to` and `status` as separate concerns.
- Reassignment is just calling `admin_assign_support_ticket` again with a different
  `platform_user_id` — no separate "unassign then assign" ceremony needed, though an explicit
  `NULL` value stays available for genuine unassignment.

## 11. Audit attribution model (proposed)

- `support_ticket_activity.actor_user_id` starts getting populated for real once a real session
  exists — no schema change, just real data flowing into an already-nullable column.
- Display resolves `actor_user_id → platform_users → auth.users` for a name, same join shape as
  everywhere else in Platform IAM.
- Not proposing a switch to the cross-module `platform_events` log — `support_ticket_activity` is
  already ticket-scoped, already built, already what the UI renders; duplicating into
  `platform_events` too would be two sources of truth for the same fact with no clear benefit
  identified yet. Worth a future look only if cross-module reporting (e.g. "everything this agent
  did today, across Support and other tools") becomes a real requirement.

## 12. Migration strategy

Because of the service_role bridge (§1d), this can ship in layers with no cutover risk, following
the S3a–S3d order exactly (§13) — each phase leaves `analytics/`'s other panels provably unaffected,
since the bridge's `service_role` branch stays unconditionally true until a real session actually
exists and someone is actually granted a role:
1. **S3a** lands login + the console-entry bridge function. No existing panel's behavior changes —
   they don't call the new bridge function at all yet.
2. **S3b** lands membership management (invite/activate/assign role/view members) — pure addition,
   nothing else depends on it yet.
3. **S3c** lands Support-specific permissions, `can_manage_support_tickets()`, the assignment RPC,
   and the real `assigned_to` FK. Assignment becomes possible; attribution is only real once S3a's
   login is actually used by a real staff member.
4. **S3d** switches the four existing S2 admin RPCs' authorization to require the real permission
   check (additive first — grant stays as a fallback layer — then, once confidence is established,
   the service_role-only grant can be reconsidered as a separate, later decision, not bundled here).

## 13. Proposed S3 implementation sequence

(As redefined — this supersedes the plan's original single-purpose "S3a–S3d for assignment only"
framing. S3 is now **Admin Console Identity & Access + Support Assignment**, not Support-assignment
alone.)

- **S3a — Admin identity.** Real login/auth for `analytics/`; map `auth.users → platform_users`;
  establish the roles/permissions this depends on; a bridge function protecting Admin Console
  access generally; preserve every existing panel's current service_role behavior unchanged during
  the transition.
- **S3b — Admin membership management.** Invite internal users, activate/deactivate them, assign a
  platform role, view members, manage permissions through the existing capability model — this is
  where "different internal users should eventually have different access to existing features"
  gets properly addressed, using tables that already exist (`platform_users`/`platform_roles`/
  `platform_role_members`), not a new system.
- **S3c — Support assignment.** `assigned_to` points to the confirmed-correct identity
  (`platform_users.id`); assign/reassign/unassign; "Assigned to me"; agent filtering; agent
  name/avatar on a ticket; agent-attributed activity.
- **S3d — Enforcement.** Backend authorization based on the authenticated platform identity and its
  permissions, not merely hiding buttons client-side — Support actions enforce the corresponding
  platform capability at the RPC boundary (§8's S3d database changes).

Per §5, Support Agent (S3c/S3d's concern) is not equated with the PRD's broader Support Admin
persona — a future, separate scoping pass covers diagnostics/troubleshooting if that's ever built.
Per §5's naming note, permission names above are illustrative; the live `platform_permissions`
catalogue is the source of truth before anything is named for real.

**Still not authorized to start:** no migration, no platform user/role/permission row, and no
`assigned_to` schema change until this plan is explicitly locked.

## 14. What explicitly remains outside S3

- Any change to S1's user-facing flow, RLS, or RPCs.
- Any change to `support_tickets`/`support_ticket_comments`/`support_ticket_activity`/
  `support_ticket_attachments` schema beyond the single proposed `assigned_to` FK.
- The PRD's broader "Support Admin" (Persona F) diagnostics/troubleshooting surface (§5) — S3 only
  covers the Support Agent ticket-handling slice of that persona.
- Attachments (S4).
- Notifications/SLA/automation (S5).
- Any change to `pulsetrack`.
- Forcing any *other* Admin Console panel (Verification, Driver KYC, Credits, Referrals, Reward
  Rules, Boost) off its current service_role client — S3a only adds the *capability* for real
  sessions to exist; no other panel's own screen/logic changes as a side effect.
- Building or resurrecting `control-tower/` — resolved (§1e): it never existed, nothing to build.

---

**Stopping here.** Nothing created, no migrations written, no `assigned_to` constraint added, no
`platform_*` rows inserted. `control-tower/` is resolved and the identity-concept ambiguity from
the earlier draft is resolved (§Headline finding, §1b) with evidence, not assumption. What remains
is your explicit lock on this plan — the S3a–S3d sequence (§13), the Support Agent/Support Admin
boundary (§5), and the permission-catalogue-first naming discipline (§5, §8) — before any
migration, platform role/permission row, or `assigned_to` schema change gets written.
