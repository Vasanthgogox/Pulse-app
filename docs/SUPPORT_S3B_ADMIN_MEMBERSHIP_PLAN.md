# S3b — Admin Console Membership Management (discovery, no code)

**Status: discovery only. No migrations, RPCs, roles, or UI written.** Everything below comes from
reading live code (`features/organization/` member-management stack) and live Platform IAM schema
(`20261224000000_platform_iam.sql`) against the linked project — same discipline as S3/S3a.

Scope, per your instruction: **extend `auth.users → platform_users → platform_role_members →
platform_roles → platform_permissions`. Do not use `organization_members` for admin identity.**
Borrow the Business app's member-management *UX pattern* only, not its *data model*.

---

## Headline finding

The Business app's member-management stack (`features/organization/{components,services}/`) is a
mature, three-part pattern that maps cleanly onto Platform IAM with **no new identity concepts
needed** — but it also reveals two real gaps Platform IAM doesn't have an answer for yet:
**no last-admin protection**, and **no per-user permission override** (role-only). Both are
answered below as explicit open decisions, not assumed.

---

## 1. What member-management UI/pattern already exists in the Business app?

Three pieces, all reusable as *pattern*, not as code:

| Piece | File | Shape |
|---|---|---|
| **List** | `TeamMembersView.tsx` | Active members + pending invites in one list, matches the app's existing hub styling (`InvitationsView`/`ConnectionsView`) |
| **Invite** | `InviteMemberModal.tsx` | Phone lookup → role selection → confirm. Two-tier: invite an existing Pulse user directly, or `createPendingTeamInvite` for someone without an account yet (activated later) |
| **Role/permission edit** | `MemberPermissionsPanel.tsx` + `members.service.ts` | `updateMemberRole` (role preset) and `updateMemberPermissions` (individual grants) both funnel through **one owner-only `set_member_role` RPC** — the DB is the authority, "only the organization owner can change member roles" is enforced server-side, not just hidden in the UI |

Other precedents worth carrying over directly:
- **Removal is soft** (`status = 'inactive'`), never a hard delete — `removeMember()` explicitly
  checks for a silently-RLS-blocked write (0 rows, no error) rather than trusting `error: null`.
- **`transfer_organization_ownership`**'s own migration comment states the exact principle S3b
  should inherit: *"Owner-only, atomic, audited... the DB is the authority — UI gating is
  convenience only."* Every Admin Console membership action (grant, revoke, activate/deactivate)
  should be a `SECURITY DEFINER` RPC, never a raw table write from `analytics/`.

**Recommendation**: reuse this three-part shape (List / Invite / Role-permission edit) verbatim as
the Admin Console's own "Admin Users" screen structure, backed entirely by Platform IAM tables
instead of `organization_members`.

## 2. Which existing `platform_roles` should be exposed in Admin Console?

Live today: `super_admin`, `control_tower`, `reach_admin` (seeded in `20261224000000_platform_iam.sql`).
All three already have live permission grants and are already the authorization source for real
RPCs (driver KYC, Reach, credits, Boost). **Exposing them in an "assign role" dropdown requires no
new role rows** — S3b's UI just needs to read `platform_roles` and let a `super_admin` assign one.

Two roles named in your S3 message (`Support Admin`, `Support Agent`) don't exist yet — that's
S3c's job (new `platform_permissions` rows for Support, possibly a new role or reuse of an
existing one). **Not deciding role/permission names here**, per your own instruction from the S3
plan: the live `platform_permissions` catalogue is the source of truth, named when S3c actually
needs them.

## 3. Are roles the only assignment mechanism, or should individual permissions be editable?

This is a real fork, not a formality — the Business app's own precedent argues both ways:

- **Business app precedent**: supports both. `updateMemberRole` (preset) AND
  `updateMemberPermissions` (individual domain toggles) exist side by side, because Pulse business
  roles have fine-grained, per-organization surface access needs.
- **Platform IAM's own design intent**: the schema comment in `20261224000000_platform_iam.sql`
  says outright: *"Roles and permissions (RBAC, not ABAC — keep it simple)."* There is no
  `platform_user_permissions` override table today — permissions flow only through
  `platform_role_permissions`, never per-user.

**Recommendation**: stay role-only for S3b. Adding a per-admin permission-override table would be
a real schema addition (not covered by "no new migrations" for this discovery pass) and
contradicts Platform IAM's explicit simplicity goal. If a future admin genuinely needs a
permission no existing role grants, the answer should be "create a new role with that exact
permission set," not "override one person's grants" — roles stay the unit of assignment.
**This is a recommendation, not a lock — flagging it as your call before S3b implementation.**

## 4. How should invitations/account creation work?

Two real sub-questions, both answered by what already exists:

- **Does the invitee already have a Supabase Auth account?** The Business app's two-tier pattern
  (`inviteTeamMember` for existing users found via lookup, `createPendingTeamInvite` for people who
  don't have one yet) is the right shape to mirror. For Admin Console specifically, "doesn't have
  an account yet" likely means using the **Auth Admin API** (`auth.admin.createUser` /
  `auth.admin.inviteUserByEmail`) from a trusted server context — this cannot happen from
  `analytics/`'s browser client even with service_role privileges for the *auth* half (only for the
  *data* half); it would need a small server-side action (Edge Function or equivalent), which is a
  real, non-trivial S3b design decision, not a UI-only concern.
- **Who can invite?** Mirrors the Business app's owner-only gate: only an existing `super_admin`
  (or a role holding a to-be-named `platform_admin.manage` permission) should be able to invite —
  enforced in the RPC, exactly like `set_member_role`'s owner check.

**Not answered here, needs your call**: does S3b build the email-invite flow (self-serve
activation), or is it acceptable for v1 to require an existing `super_admin` to create the
`auth.users` account directly (Dashboard or Admin API) and then just *assign* the platform role
through the new UI? The second is dramatically smaller scope and matches exactly what we just did
manually for `platform-admin@gogox.com` — just given a UI instead of me running migrations by hand.

## 5. Active/inactive lifecycle

`platform_users.status` already has exactly this: `CHECK (status IN ('active', 'suspended'))`.
No schema change needed — S3b's "deactivate" action is `UPDATE platform_users SET status =
'suspended'`, and `has_platform_permission()` already filters on `status = 'active'`, so a
suspended admin's access is revoked immediately everywhere that function is checked, with zero
additional enforcement work. Reactivation is the same update in reverse. This is the cleanest part
of the whole design — the schema already anticipated it.

## 6. What happens when the last `super_admin` is removed?

**Real gap, confirmed by inspection: nothing prevents it today.** The migration I wrote and ran
for the `vasanth.raj@gogox.com` cleanup was a raw `DELETE`, with no check for "is this the last
`super_admin`" — it happened to be safe only because `platform-admin@gogox.com` was granted
`super_admin` *first*, in the same migration, before the delete ran. A `revoke_platform_role` RPC
built carelessly could lock everyone out of the Admin Console with no recovery path except a
direct DB fix.

**Recommendation**: mirror `transfer_organization_ownership`'s "DB is the authority" principle —
a `revoke_platform_role(platform_user_id, role_id)` RPC should `RAISE EXCEPTION` if the target role
is `super_admin` and this would leave zero active `super_admin` holders, the same way the
Business app's ownership transfer is atomic and guarded, not left to UI discipline. This needs to
be designed into S3b's first RPC, not retrofitted later.

## 7. Can `super_admin` manage all roles, or only another `super_admin`?

Not defined anywhere today — Platform IAM has no role-hierarchy concept, just flat role membership.
Two real options:
- **(a) `super_admin` manages everything** (simplest, matches "super" in the name, matches how
  the Business app's single `owner_id` has unilateral authority).
- **(b) Role-scoped management** (e.g., a future `control_tower` lead manages only
  `control_tower` members) — more granular, no current precedent, and not needed by anything live
  today.

**Recommendation**: (a) for S3b's first cut — it's a straight extension of "only `super_admin` can
invite" from §4, needs no new permission modeling, and nothing today demands (b). Revisit only if
a real need for delegated, role-scoped admin management shows up later.

## 8. How should platform-user activity be audited?

Two existing candidates, not competing — they answer different questions:
- **`platform_role_members.granted_by`** (already exists, already nullable) — answers "who granted
  this specific role, and when" (`granted_at`) for free, no new column needed.
- **`platform_events`** (already exists, append-only, `event_type`/`actor_user_id`/`payload`) —
  the natural home for "Admin X invited Y," "Admin X suspended Y," "Admin X changed Z's role,"
  exactly matching its existing use for `BusinessVerified`/`ReachPublished`/`CreditsAwarded`-style
  events. S3b's membership RPCs should call `emit_platform_event()` (already exists, already
  `SECURITY DEFINER`, already grants to `authenticated`) for every membership change — no new
  audit table needed.

## 9. What does S3c (Support assignment) need from this identity model?

Two concrete things, both already satisfied by what S3b produces without extra work:
- A way to list `platform_users` filtered to whichever role(s) end up meaning "can be assigned a
  ticket" — a plain `SELECT ... JOIN platform_role_members ... WHERE role name = X` query, no new
  table.
- A way to resolve `platform_users.id → auth.users → display name` for "Assigned to <name>" UI —
  same join shape S3b's own member list already needs to render names. S3b's list-rendering work
  and S3c's assignee-picker are the same query with a different `WHERE`, not two designs.

## 10. How should existing Admin Console panels move from service_role to permission enforcement?

This is S3d, but S3b's membership model is what makes it possible at all — you can't gate a panel
behind a permission if there's no UI to grant that permission to anyone yet. The mechanism itself
is already proven: `can_review_driver_kyc()`'s `service_role OR has_platform_permission(...)`
bridge (used today by `platform_review_driver_kyc_submission`). S3d's job per panel is: write one
bridge function per feature area, call it from that panel's RPCs, and leave the `service_role`
branch in place indefinitely as a break-glass path — exactly the layered, no-cutover-risk strategy
already used for Support's own S3 plan. **Nothing about S3b needs to anticipate this beyond
producing real `platform_users`/role data for the bridge functions to check** — no coupling risk.

---

## Proposed S3b architecture (for your decision, not yet built)

```
Admin Console (analytics/) → new "Admin Users" screen
   ├── List: platform_users JOIN platform_role_members JOIN platform_roles
   │         (mirrors TeamMembersView.tsx's shape)
   ├── Invite: super_admin-only RPC, two-tier per §4
   │         (mirrors InviteMemberModal.tsx's shape)
   ├── Role assign/change: super_admin-only RPC (role-only, per §3)
   │         (mirrors set_member_role's "DB is the authority" pattern)
   ├── Activate/deactivate: UPDATE platform_users.status (already schema-ready, §5)
   └── Every write RPC calls emit_platform_event() for audit (§8)

revoke_platform_role() guards against removing the last super_admin (§6)
```

## Proposed database changes (illustrative only — not written, not decided)

- `assign_platform_role(platform_user_id, role_id)` — `super_admin`-only, `emit_platform_event`.
- `revoke_platform_role(platform_user_id, role_id)` — `super_admin`-only, last-`super_admin` guard,
  `emit_platform_event`.
- `set_platform_user_status(platform_user_id, status)` — `super_admin`-only, `emit_platform_event`.
- Invitation/account-creation mechanism — depends entirely on your answer to §4's open question;
  could be zero new RPCs (manual account creation stays a Dashboard action, S3b only adds
  role-assignment UI) or one new server-side function if self-serve invites are wanted.
- No new tables. No new roles or permissions. No change to `platform_users`/`platform_roles`/
  `platform_permissions`/`platform_role_members`/`platform_events` schema.

## What explicitly remains outside S3b

- Naming or creating Support-specific roles/permissions (S3c).
- `support_tickets.assigned_to` FK or any Support schema change (S3c).
- Any RPC-level enforcement change to existing panels (S3d).
- Per-user permission overrides (§3) — recommended against, but flagged as your call.
- Role-scoped delegated admin management (§7) — no current need, not building it.
- The S4 attachment runtime QA — unrelated, tracked separately in `docs/SUPPORT_SYSTEM_PLAN.md`.

## Open decisions for you before any S3b code

1. **§3** — role-only assignment (recommended) vs. per-admin permission overrides.
2. **§4** — self-serve email invite (bigger scope) vs. manual account creation + role-assignment
   UI only (smaller scope, matches what we just did by hand for the current bootstrap).
3. **§6** — confirm the last-`super_admin` guard as a hard requirement for the first RPC (I'd treat
   this as non-negotiable given what just happened with the personal-account cleanup, but it's
   your call to lock).
4. **§7** — confirm `super_admin`-manages-everything (recommended) as the v1 authority model.

---

**Stopping here.** No migration, RPC, role, or UI code written. Waiting on the four decisions above
before producing an exact S3b implementation plan (mirroring the S1/S2/S3a plan → review → migrate
→ verify cadence).
