# Team RBAC — invite → signup → what they can actually see

Plain-English walkthrough of how a person goes from "not in Pulse" to
"logged in with the right buttons visible". Traced from live code, not theory.

Companion to `docs/RBAC_OPERATING_MODEL.md` (which covers the org-level
Asset / Aggregate / Hybrid model). This file covers the **member** side.

---

## 1. The one idea that explains everything

Access is an **AND of three things**, not one setting.

```
What the member can finally do
        │
        ├── 1. What the ORG bought/is       ← operating model → capabilities
        │      (Asset / Aggregate / Hybrid)
        │
        ├── 2. Which DOMAINS the member has ← Finance / Sales / TripOps flags
        │
        └── 3. Which SURFACES are ticked    ← the 100+ checkboxes
```

All three must say yes. Any one says no → the button is hidden.

> **The rule to remember:**
> `org capabilities  ∩  member domains  ∩  member surfaces`
>
> A member can never have more than the org has. Ticking every checkbox on a
> member of an Asset-only org still gives them zero indent access, because the
> org itself doesn't have give-load capability.

**Why it's built this way:** the org model changes when the business changes
(buys trucks, stops brokering). Member permissions change when people change
jobs. Keeping them separate means changing one doesn't corrupt the other.

---

## 2. The vocabulary (learn these 4 words once)

| Word | What it means | Where it lives |
|---|---|---|
| **Capability** | What the *org* is allowed to do, e.g. `dispatch`, `marketplace_bid`. Derived from the operating model. | `lib/capabilities.ts` |
| **Domain** | A big section of the app: **Finance**, **Sales**, **TripOps**. On/off per member. | `permissions.domains` on the member row |
| **Surface** | One fine-grained action, e.g. `tripops.indents.create`. ~100 of them. These are the checkboxes on the Member access screen. | `lib/memberSurfaces.ts` |
| **Platform role** | A convenience preset (`admin`, `finance`, `sales`, `tripops`, `restricted`) that fills in domains + surfaces for you. | `teamInviteRoles.util.ts` |

**Surface IDs are just names.** `tripops.indents.create` currently renders
under the *Sales* section. The `tripops.` prefix is historical — it does not
decide where the checkbox appears or what it unlocks.

---

## 3. End-to-end flow

### Stage A — Owner sends the invite

Owner opens **Invite member**, types a phone number (and optionally email).

Before anything is saved, the app asks the database "do we already know this
person?" via `precheck_team_invite_contact`. Five possible answers:

| Answer | Meaning | What the UI does |
|---|---|---|
| `pending_invite` | Nobody with this number. | Normal invite → they'll sign up later. |
| `invite_existing_user` | They already have a Pulse account (different org). | Invite them directly — no signup needed. |
| `already_member` | Already in *this* org. | Block. Nothing to do. |
| `already_invited` | Invite already pending. | Block the duplicate. |
| `email_registered` | Email belongs to someone else's account. | Warn about the mismatch. |

**Why precheck exists:** without it you'd create a second account for a person
who already has one, and their existing trips/ledgers wouldn't follow them.

Owner then picks a role. The role is a **shortcut**, not a separate mechanism —
it just pre-fills the domain flags and surface ticks, which the owner can then
adjust individually.

| Role | Domains it turns on |
|---|---|
| Administrator | all three + team management |
| Finance | Finance |
| Sales | Sales |
| TripOps | TripOps |
| `restricted` | none — can see the workspace exists, nothing more |

`restricted` is a deliberate floor. If an owner unticks every domain, the member
becomes `restricted` rather than silently falling back to TripOps.

A row is written to `organization_team_invites` with status `pending`, an expiry,
and a `permissions` JSON blob holding role + domains + surfaces.

> **The permissions are frozen into the invite at send time.** They are not
> re-read from the role later. Changing the role preset afterwards does not
> alter invites already sent.

---

### Stage B — The person signs up

Two different doors, same destination.

**Door 1 — brand-new person**

```
Gets invite → installs/opens Pulse → signs up with phone + OTP
   → account created (users + profiles rows)
   → app looks for invites matching their VERIFIED phone
```

**Door 2 — already has a Pulse account**

```
Already logged in → app looks for invites matching their phone/email
   → shows "You've been invited to <Org>"
```

The lookup is `resolve_pending_team_invitations_by_phone` (or `..._by_email`).
Two things worth knowing:

- It **expires stale invites first**, so an old invite can't be accepted late.
- It returns `active` and `expired` separately, so the UI can say
  "this expired, ask for a new one" instead of failing silently.

`PendingInviteResumeGate` is what re-checks after login, so an invite that
arrives mid-session still gets picked up.

---

### Stage C — Accepting (the security-critical step)

`accept_pending_team_invitation` runs server-side. In order:

```
1. Is the invite still 'pending'?          → no: stop (expired/already used)
2. Does the logged-in user's VERIFIED phone
   match the invited phone?                → no: HARD REJECT
3. Already a member of this org?
      ├─ active   → mark invite accepted, change nothing
      └─ inactive → reactivate + overwrite permissions
4. Otherwise → INSERT a new organization_members row
5. Mark the invite 'accepted'
```

**Step 2 is the one that matters.** The check is `profiles.phone` (verified via
OTP) against the invite's phone. Forwarding the invite to a friend does nothing —
they'd fail the phone match. The invite is not a bearer token.

**Step 3's two branches** exist for the rejoin case: someone removed from the org
and re-invited gets their row reactivated with *fresh* permissions, not their old
ones. Prevents a removed finance manager from silently regaining ledger access.

At this point `organization_members` holds:

```
organization_id · user_id · role · status='active' · permissions{...}
```

That `permissions` blob is now the member's source of truth.

---

### Stage D — What they see when they open the app

Every screen and button re-derives access at render time:

```
org operating model
      ↓
org capabilities            e.g. dispatch, marketplace_bid
      ↓
   ∩  member domains        Finance? Sales? TripOps?
      ↓
   ∩  member surfaces       tripops.indents.create? finance.reports?
      ↓
   what actually renders
```

Read through `useCapabilities` / `useMemberCapabilities`, with `ModelAccessGate`
wrapping gated UI.

Two guards worth knowing:

- **Owners and admins bypass domain gating** — they always get everything the
  org has. You cannot lock out an owner via checkboxes.
- **A domain section is only unlockable if the org qualifies.** A give-load org
  with dispatch but no marketplace caps still gets Sales unlocked, because the
  Indents surfaces live there.

---

## 4. Worked example

**Priya, hired as a dispatcher at an Aggregate (give-load) org.**

| Step | What happens |
|---|---|
| Owner invites `+9198…`, role **TripOps** | Precheck: no account → `pending_invite`. Invite row saved with TripOps domains + surfaces. |
| Priya signs up, verifies OTP | Phone verified on her profile. |
| App finds the invite | Phone matches → shown "Join <Org>". |
| She accepts | Member row created, `status='active'`, permissions copied from invite. |
| She opens Pulse | Org is Aggregate → has `dispatch`, no fleet caps. |
| Result | ✅ Trips, indents, dispatch · ❌ Finance ledgers · ❌ Vehicles/drivers — the org has no fleet capability, so nobody gets those, regardless of checkboxes. |

Now the owner unticks **Create indent** on her Member access screen. Next
render: she still sees the indent list, but the create button is gone. No
re-invite, no logout — the surface map is read live.

---

## 5. Things that surprise people

| Surprise | Explanation |
|---|---|
| "I ticked every box, still can't see Vehicles." | The org's operating model has no fleet capability. Member permissions can't exceed the org. |
| "Indent permissions say `tripops.` but sit under Sales." | IDs are stable names; the section is set by a separate `domain` field. Renaming IDs would orphan saved grants. |
| "Removed a member, re-invited, old permissions gone." | Intentional — rejoin overwrites with the new invite's permissions. |
| "Invite link did nothing for my colleague." | Acceptance matches on verified phone. Invites are per-person, not transferable. |
| "Owner still sees everything after I restricted them." | Owners/admins bypass domain gating by design. |
| "Member has no domains — what are they?" | `restricted`. Workspace visible, nothing functional. Deliberate floor, not a bug. |

---

## 6. ⚠️ The real limitation

**All of this is client-side.**

The checkboxes decide what *renders*. Row-level security in the database
authorizes on **org membership alone** — it does not currently check surfaces.

Meaning: a member who is in the org can, via a direct API call, reach data their
checkboxes hide in the UI.

- ✅ Fine for **preventing mistakes** and reducing clutter — its actual job today.
- ❌ Not a defence against a **determined insider**.

Treat surfaces as *"what should this person be shown"*, not *"what is this person
cryptographically prevented from reading"*. Server-side surface enforcement is
still open (noted in `RBAC_OPERATING_MODEL_CHANGELOG.md`).

---

## 7. Where things live

| What | File |
|---|---|
| Surface catalog (all checkboxes) | `lib/memberSurfaces.ts` |
| Org capabilities from model | `lib/capabilities.ts` |
| Roles, domains, presets | `features/organization/utils/teamInviteRoles.util.ts` |
| Duplicate-account precheck | `features/organization/services/teamInvitePrecheck.service.ts` |
| Find + accept invites | `features/organization/services/teamInvitationResolver.service.ts` |
| Post-login invite catch | `components/PendingInviteResumeGate.tsx` |
| Member access UI | `features/organization/components/MemberPermissionsPanel/` |
| Accept / resolve RPCs | `supabase/migrations/20261107020000_team_invitation_resolver.sql` |
| Email variant | `supabase/migrations/20261107060000_team_invitation_resolver_by_email.sql` |
| Conflict handling | `supabase/migrations/20261107040000_team_invite_account_conflicts.sql` |
