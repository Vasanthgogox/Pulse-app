# S3b — Admin Membership: implementation plan (proposed, not applied)

**Status: plan for review. No migration written, no RPC/UI code changed.** Same gate as every
prior slice: this plan is presented first; nothing gets written until it's reviewed. Locks in the
four decisions from `docs/SUPPORT_S3B_ADMIN_MEMBERSHIP_PLAN.md`:

1. **Role-only** assignment — no per-admin permission overrides.
2. **Self-serve invitation** — admin enters email + role; the invited person authenticates
   themselves; an admin never creates or knows another person's password.
3. **Mandatory, server-side last-`super_admin` guard.**
4. **`super_admin` manages everything** in v1 — no delegated, role-scoped admin management yet.

---

## 1. The one open mechanic these decisions require — flagged before anything is written

"Self-serve invitation" (decision 2) needs an answer to a question none of the four decisions
directly settled: **what state is a `platform_users` row in between "invited" and "the person has
actually shown up"?**

Today `platform_users.status` only allows `'active'` or `'suspended'`
(`CHECK (status IN ('active', 'suspended'))`) — there is no `'invited'` state. Your own diagram
implies a third state is needed:

```
Invite → Invitation → User authenticates/completes setup → platform_users = active
```

**Proposed answer**: add `'invited'` as a third allowed value to that `CHECK` constraint. This
*is* a schema change — small, additive, non-breaking (existing rows are all `'active'` or
`'suspended'` already) — but it's the cleanest way to model the lifecycle you diagrammed, rather
than either (a) creating the `platform_users` row only after first login (needs something to
*notice* the first login and create the row — no such trigger exists today and building one is
more machinery than widening a `CHECK`), or (b) creating it as `'active'` immediately at invite
time (works today with zero schema change, but then "Role membership becomes effective" happens
before the person has done anything, which contradicts your diagram's intent).

**This is the one thing I'd like you to confirm before I write the migration** — everything else
below follows directly from the four decisions you already locked.

## 2. Exact invitation mechanic

`analytics/`'s existing **service-role client** (`lib/supabase.ts`) already holds the service_role
key client-side (documented, accepted: "local/dev only, never ship publicly"). That key is what
Supabase's Auth Admin API requires for `auth.admin.inviteUserByEmail()` — so no new server
component is needed; the existing client can call it directly:

```
supabase.auth.admin.inviteUserByEmail(email, { redirectTo: <console URL> })
```

This creates the `auth.users` row (if one doesn't exist) and emails the person a magic link — the
admin never sees or sets a password, satisfying decision 2 exactly. The call's response includes
the new `auth.users.id` immediately, so the `platform_users` row (status `'invited'`, per §1) and
its `platform_role_members` grant can be created in the same action, before the person ever clicks
the link — "who has been invited to what role" is visible in the Admin Users list right away, not
only after they accept.

When the invited person clicks the link and authenticates for the first time, their session is
established the same way S3a's own login already works (email/password or Google — the console
doesn't care which; Supabase Auth handles both uniformly). **Flipping `platform_users.status` from
`'invited'` to `'active'` on first login** needs one small trigger-or-check: simplest is a check
inside the existing `AdminAuthProvider` resolution path (S3a) — the moment a session resolves and
`get_my_platform_permissions()` is about to be called, if the caller's `platform_users.status =
'invited'`, flip it to `'active'` via a tiny `activate_platform_user()` RPC first. No polling, no
webhook, no Edge Function — it piggybacks on a code path that already runs on every login.

## 3. Exact RPCs (new, all `SECURITY DEFINER`, all call `emit_platform_event`)

| RPC | Who can call it | What it does |
|---|---|---|
| `invite_platform_admin(email, role_id)` | `super_admin` only | Wraps the Admin API call (§2) + creates `platform_users` (`status='invited'`) + `platform_role_members` row. Returns the new/existing `platform_users.id`. |
| `activate_platform_user()` | Any authenticated platform user, about themselves only | `UPDATE platform_users SET status='active' WHERE user_id = auth.uid() AND status='invited'`. Called once, automatically, on first successful login (§2) — no admin action needed. |
| `change_platform_role(platform_user_id, new_role_id)` | `super_admin` only | Replaces the target's current role(s) with `new_role_id`. Runs the last-`super_admin` guard (§4) before removing an existing `super_admin` grant. |
| `set_platform_user_status(platform_user_id, status)` | `super_admin` only | Suspend/reactivate. Runs the same last-`super_admin` guard when suspending. |
| `remove_platform_admin(platform_user_id)` | `super_admin` only | Full removal — deletes the `platform_users` row (cascades to `platform_role_members`), same shape as the manual cleanup already done for the personal-account bootstrap, now as a reusable, guarded RPC instead of a one-off migration. Runs the same guard. |

## 4. The last-`super_admin` guard — one shared check, used by three RPCs

A single helper, not duplicated three times:

```sql
create or replace function public.platform_would_remove_last_super_admin(
  p_excluding_platform_user_id uuid
) returns boolean
language sql stable security definer set search_path to ''
as $$
  select not exists (
    select 1
    from public.platform_role_members prm
    join public.platform_users pu on pu.id = prm.platform_user_id
    join public.platform_roles pr on pr.id = prm.role_id
    where pr.name = 'super_admin'
      and pu.status = 'active'
      and pu.id <> p_excluding_platform_user_id
  );
$$;
```

`change_platform_role`, `set_platform_user_status` (suspend path), and `remove_platform_admin` all
call this before acting and `RAISE EXCEPTION 'cannot_remove_last_super_admin'` if it returns true.
This closes the exact gap the S3b discovery found (the manual cleanup migration had no such check
and only happened to be safe by ordering).

## 5. Authorization — S3b's RPCs can be genuinely enforced from day one

This is a finding worth calling out: because S3a already established a **real authenticated
session** for the Admin Console (not just service_role), these five new RPCs don't need to wait
for S3d to have real per-admin enforcement. They should be called through `analytics/`'s
**anon-key auth client** (`lib/supabaseAuth.ts`, added in S3a), not the service-role client, with
a bridge function gating them:

```sql
create or replace function public.can_manage_platform_admins()
returns boolean language sql stable security definer set search_path to ''
as $$
  select public.has_platform_permission((select auth.uid()), 'platform_admin.manage');
$$;
```

(One new permission key, `platform_admin.manage`, granted only to `super_admin` — the sole new
`platform_permissions` row this slice needs.) Every other existing panel stays on service_role
until S3d, unaffected — this is additive, scoped only to the five new RPCs above, not a change to
anything already built.

## 6. Admin Console UI (`analytics/`)

New view, structured exactly as you specified:

- **Admin Users list** — columns Name, Email, Role, Status, **Last activity**. "Last activity"
  needs no new column: `auth.users.last_sign_in_at` already exists and is exactly this field —
  confirmed live on the linked project. Query: `platform_users JOIN auth.users JOIN
  platform_role_members JOIN platform_roles`, same join shape as everywhere else in Platform IAM.
- **Invite Admin** — email + role dropdown (reads live `platform_roles`), calls
  `invite_platform_admin`.
- **Manage Admin** — change role (`change_platform_role`), suspend/reactivate
  (`set_platform_user_status`), remove (`remove_platform_admin`) — each a confirm-then-call action,
  server response is the source of truth for success/failure (mirrors `removeMember()`'s pattern
  of never trusting a silent no-op as success).
- **Effective permissions** — derived and displayed read-only from the assigned role's
  `platform_role_permissions`, never edited directly (decision 1).

New files (illustrative, exact names decided at implementation time):
`analytics/src/components/admin/AdminUsersPanel.tsx`, `analytics/src/lib/platformAdmins.ts`
(data access, mirrors `supportTickets.ts`'s shape), a Topbar entry next to Support.

## 7. Migration contents (proposed, not written)

One migration:
- `ALTER TABLE platform_users` — widen the `status` CHECK to include `'invited'` (§1, needs your
  confirmation first).
- `INSERT INTO platform_permissions ('platform_admin.manage', ...)`.
- `INSERT INTO platform_role_permissions` granting it to `super_admin` only.
- The five RPCs (§3) + the two helper functions (§4, §5).
- Grants: all five action RPCs `REVOKE ... FROM PUBLIC, anon`, `GRANT ... TO authenticated`
  (matching Support's established stricter-than-legacy convention) — the `can_manage_platform_admins()`
  check inside each is the real gate, the grant is the outer layer.

No changes to `support_tickets`/`support_ticket_*` schema. No changes to any existing panel's
current behavior.

## 8. Verification plan (once approved)

1. `npm run db:preflight`, isolate unrelated pending migrations, confirm only this one pending.
2. Push, re-fetch every new function/permission/role-permission row to confirm deployed state
   matches.
3. Invite a disposable test email (not a real person's inbox without asking first) with a
   non-`super_admin` role → confirm `platform_users` row lands as `'invited'`, `platform_role_members`
   row correct, email actually sent.
4. Attempt `change_platform_role`/`set_platform_user_status`/`remove_platform_admin` as a
   *non*-`super_admin` session → confirm `can_manage_platform_admins()` rejects it (real
   enforcement test, using a genuine second session — same REST/API methodology established for
   Support's own RLS verification, not the `postgres`/bypassrls shortcut).
5. Attempt to suspend/remove/demote the **only** active `super_admin` → confirm
   `cannot_remove_last_super_admin` fires and nothing changes.
6. Sign in as the invited test account → confirm `status` flips `'invited' → 'active'`
   automatically, no manual step.
7. `tsc -b` / `npm run build` for `analytics/`.
8. Report exact migration filename + diff scope before pushing, same as every prior gate.

## 9. What explicitly remains outside this slice

- `support_tickets.assigned_to` or any Support schema change (S3c).
- RPC-level enforcement for the *pre-existing* panels — Verification, Driver KYC, Credits,
  Referrals, Reward Rules, Boost (S3d). Only the five new admin-management RPCs get real
  enforcement now.
- Per-admin permission overrides (explicitly decided against).
- Role-scoped delegated management (explicitly decided against for v1).
- The S4 attachment runtime QA — tracked separately, not blocked on this.

## 10. Follow-up found during live lifecycle QA (not yet done)

`invitePlatformAdmin()` / `invite-platform-admin`'s `redirectTo` is currently derived from the
browser's own `window.location.origin + import.meta.env.BASE_URL` at call time. Found via a real
invite attempt: `http://localhost:3002/ops-9f3a2c/` wasn't in the Supabase project's Redirect URLs
allow-list, so Supabase silently fell back to the Site URL instead of landing the invited person
in the Admin Console — confirmed via the Dashboard, not guessed. Fixed for now by adding the exact
URL to the allow-list (a Dashboard change, not code).

**Before this ships anywhere beyond local dev**: replace the browser-derived origin with a fixed,
server-side `ADMIN_CONSOLE_URL` (env var on the Edge Function) — an admin-invitation flow shouldn't
trust "whatever origin happened to invoke it" for where the confirmation link lands. Deliberately
not doing this now, per instruction, while the local flow is still being proven out.

---

**Stopping here.** Nothing written. The one thing I need from you before drafting the migration:
confirm §1's `'invited'` status addition to `platform_users.status`'s `CHECK` constraint — the
smallest schema change that makes the invitation lifecycle you diagrammed actually representable.
Everything else in this plan follows directly from your four locked decisions.
