# Pulse Onboarding & Signup — System Audit

**Status:** Phase 2 started — persona hub + metadata bands (see §18)  
**Scope:** Business, driver, invites, auth, org provisioning, verification, incomplete states  
**Constraint:** Redesign UX/IA/flows while preserving DB schema (where possible), auth APIs, permissions, org relationships

---

## 1. Executive summary

Pulse today has **two parallel self-serve wizards** (business + driver) plus **post-signup invite surfaces** (team, fleet, network). Provisioning is **server-driven** via `handle_new_user` on `auth.users` INSERT; clients pass **auth metadata**, not direct org inserts.

| Dimension | Current state | Maturity gap |
|-----------|---------------|--------------|
| Business signup | 7-step form wizard (`/sign-up`) | Feels like admin form, not SaaS onboarding |
| Driver signup | 8-step wizard + KYC uploads | OTP is UI-only; no fleet link at signup |
| Team join | RPCs + invite modal exist | **No invitee inbox UI**; `skipOrgCreation` unused |
| Trust / verification | Email confirm + mock phone OTP | No progressive trust tiers |
| Personas | 2 entry paths (welcome) | Brokers, ops, fleet-owner nuance collapsed into `user` |
| Completion tracking | `profiles.onboarding_completed` | **Column unused in app** |

---

## 2. Personas vs what the product actually supports

| Target persona | Intended product role | Current entry | Org at signup | Notes |
|----------------|----------------------|---------------|---------------|-------|
| Transport business / dispatcher | `profiles.role = user` | `/sign-up`, `/welcome` → business | **Yes** — owner org via trigger | `operating_model`, `business_type`, `employee_count` persisted |
| Fleet owner (asset) | Same `user` role | Same business flow | Same | Differentiated only by `operating_model` / `aggregated`/`asset` flags later |
| Broker / aggregate (non-asset) | Same `user` role | Same | Same | `monthlyVolume` collected in UI **but not saved** |
| Driver | `profiles.role = driver` | `/driver-signup` | **No** | Fleet via invites / phone match / roster |
| Internal ops / team member | `organization_members` | **No dedicated path** | Should use `skip_org_creation` | Flag exists; **no signup UI** |
| Invited team admin/member | `organization_members` | Post-hoc invite only | Join existing org | Accept RPCs exist; **no consumer screen** |

**Implication:** “Mature SaaS” requires **persona-first routing** (intent → path), not only Business vs Driver on `/welcome`.

---

## 3. Current signup screens & routes

| Route | File | Purpose |
|-------|------|---------|
| `/welcome` | `app/welcome.tsx` | Web: Business vs Driver vs Sign in |
| `/sign-up` | `app/sign-up.tsx` → `BusinessSignUpScreen` | Business wizard |
| `/driver-signup` | `app/driver-signup.tsx` | Driver wizard |
| `/sign-in` | `app/sign-in.tsx` | Email/password + Google; Create account → `/welcome` |
| `/auth/callback` | `app/auth/callback.tsx` | OAuth + `applyPendingOAuthMetadata` |
| `/auth/reset-password` | `app/auth/reset-password.tsx` | Password reset |
| `/` | `app/index.tsx` | Auth guard → tabs or sign-in |
| `/(modals)/invite-member` | Invite existing user to org | Post-onboarding |
| `/(modals)/team` | Team list + pending invites | Post-onboarding |

**Boot allow-list** (no redirect during signup): `lib/indexBootRedirect.util.ts`, `components/AppBootGate.tsx` — includes `/sign-up`, `/driver-signup`.

**Mobile layout:** `useMobileLayout = width < 1024` — custom keypad for phone/OTP; scroll steps for forms.

---

## 4. Business onboarding flow (detailed)

**Orchestration:** `features/auth/signup/hooks/useBusinessSignUpFlow.ts`  
**UI:** `features/auth/signup/BusinessSignUpScreen.tsx`

| Step | Label | Component | Validation / APIs |
|------|-------|-----------|-------------------|
| 0 | Phone | `PhoneStep` | `checkExistingUserByPhone` (RPC + Edge fallback) |
| 1 | Verify | `OtpStep` | **Mock only** — 6 digits; `EXPO_PUBLIC_MOCK_OTP` in prod |
| 2 | Company | `OrgStep` | `checkOrganizationNameTaken` |
| 3 | Details | `CompanyDetailsStep` | `businessType`, `operatingModel`, fleet/volume, employees |
| 4 | Location | `CompanyLocationStep` | `addressLine`, `CityPicker` → city/state/zone |
| 5 | Account | `AccountStep` | email, password, name; optional Google |
| 6 | Success | `SuccessStep` | Email verification UI or “Go to app” |

**Account creation:** `AuthContext.signUp` → `auth.service.signUp` with metadata:

- `role`, `operating_model`, `full_name`, `company_name`, `phone`, `address_line`, `city`, `state`, `zone`, `business_type`, `employee_count`
- Optional `skip_org_creation` (never set by UI today)

**Not persisted (gap):** `fleetSize`, `monthlyVolume` from step 3.

---

## 5. Driver onboarding flow (detailed)

**File:** `app/driver-signup.tsx` (monolith ~1.8k lines)

| Step | Label | Behavior |
|------|-------|----------|
| 0 | Phone | Same phone-exists check as business |
| 1 | Verify | **UI-only** — 4 digits, no SMS |
| 2 | Account | Name, email, password |
| 3–5 | License / Aadhaar / PAN | Storage `driver-documents`; metadata `driver_documents` |
| 6 | Photo | Avatar presets (local seed, not always `profiles.avatar_seed`) |
| 7 | Done | `signUp({ role: 'driver' })` then sign-in |

**DB:** `handle_new_user` creates **`profiles` only** for drivers (no org, no `drivers` row).

**Fleet link (post-signup):** `driver_invites`, `sync_my_driver_rows_user_id`, `driver_signup_matches`, dispatcher roster.

---

## 6. Invite flows

### 6.1 Team invites (organization members)

- **Service:** `features/organization/services/members.service.ts`
- **UI:** `InviteMemberModal`, `TeamMembersView`, workspace team panel
- **DB:** `organization_members` with `status: 'invited'`
- **RPCs:** `get_my_team_invites`, `accept_team_invite`, `reject_team_invite`
- **Gap:** `useMyTeamInvitesQuery` exported but **no screen** for invitees to accept during/after signup

### 6.2 Driver fleet invites

- **Service:** `features/drivers/services/drivers.service.ts`
- **UI:** `DriverInviteModal`, network tab, `DriverInviteCard`
- **DB:** `driver_invites`, `drivers`

### 6.3 Network / connection requests

- B2B org connections — separate from signup (`connection_requests`, `InvitationsView`)

### 6.4 Public invite link

- `public/invite/index.html` sets `pulse_invite_ref` in sessionStorage — **no app reader found**

---

## 7. Role assignment & permissions

### 7.1 Auth roles (`profiles.role`)

| Value | Routing | Provisioning |
|-------|---------|--------------|
| `user` | `/(tabs)` dispatcher | Profile + org + `organization_members` (owner) unless `skip_org_creation` |
| `driver` | `/(driver)` | Profile only |

**`roleVerified`:** `AuthContext` — true after DB profile load; gates `app/index.tsx`.

### 7.2 Operating model & capabilities

- **Signup metadata:** `operating_model` → `organizations.operating_model`
- **Capabilities:** `lib/capabilities.ts` — derived from `profiles.aggregated` / `profiles.asset`, **not** from `organization_members.permissions` (always `{}` on invite)
- **Org UI roles:** `useOrgRole` — owner/admin/member for team invite UI

### 7.3 Org member roles

`owner` | `admin` | `member` | `driver` (and legacy labels in migrations). Team invites assign `admin` | `member`.

---

## 8. Organization creation logic

**Single source of truth:** PostgreSQL trigger `public.handle_new_user()`  
**Latest reference:** `supabase/migrations/20260428141000_rename_fleet_size_to_employee_count.sql`

```
auth.users INSERT
  → profiles (from metadata)
  → IF role = 'user' AND NOT skip_org_creation:
       organizations (name from company_name)
       organization_members (owner, active)
```

**Client never INSERTs organizations** on signup.

**Duplicate name guard:** RPC `organization_name_is_taken` + client messaging (“ask admin for invite”).

**OAuth backfill:** `applyPendingOAuthMetadata` updates auth metadata, profile, and existing org row if user completed wizard before Google.

---

## 9. Verification flows

| Layer | Business | Driver |
|-------|----------|--------|
| Phone | Debounced exists-check; **no OTP provider** | Same |
| OTP UI | 6-digit mock | 4-digit mock |
| Email | Supabase `signUp` + optional verification gate | Same |
| Google OAuth | Welcome, account step, callback | Driver step 0 / account |
| KYC docs | N/A | Storage upload; paths in user metadata |
| Email resend | `resendVerificationEmail` on success step | N/A on driver done step |

**Trust gap:** Phone verification does not establish identity; prod requires `EXPO_PUBLIC_MOCK_OTP=true` or OTP step blocks.

---

## 10. Session handling

| Concern | Implementation |
|---------|----------------|
| Storage | `expo-secure-store` (native), AsyncStorage (web/Expo Go) |
| Session restore | `AuthContext` + Supabase client |
| Pending OAuth | `@pulse_pending_oauth_metadata_v1` AsyncStorage |
| Boot gate | `AppBootGate` — blocks until auth restored |
| Degraded mode | JWT metadata without DB profile (`applyDegradedAuthSession`) |
| Post-signup | Business success → `/` without waiting for email confirm (config-dependent) |

---

## 11. Required DB fields (signup path)

### `auth.users.raw_user_meta_data` (written by client)

| Field | Business | Driver |
|-------|----------|--------|
| `role` | `user` | `driver` |
| `operating_model` | user-selected | `ASSET_BASED` (hardcoded) |
| `full_name` | ✓ | ✓ |
| `company_name` | ✓ | — |
| `phone` | ✓ (+91) | ✓ |
| `address_line`, `city`, `state`, `zone` | ✓ | — |
| `business_type`, `employee_count` | ✓ | — |
| `skip_org_creation` | API only | — |
| `driver_documents` | — | post-upload |

### `public.profiles` (trigger + updates)

`id`, `email`, `full_name`, `role`, `phone`, `aggregated`, `asset`, `company_name`, …  
**Unused:** `onboarding_completed` (defaults `false`, never updated in app)

### `public.organizations` (business only)

`name`, `operating_model`, `address_line`, `city`, `state`, `zone`, `business_type`, `employee_count`

### Not in schema / not written

- `fleet_size`, `monthly_volume` (UI only today)

---

## 12. Incomplete onboarding states

| State | Detection | User experience |
|-------|-----------|-----------------|
| Unauthenticated | no session | Redirect sign-in / welcome |
| Session restoring | `status === 'restoring'` | Splash |
| Profile loading | `user && !profile` | Verify splash |
| Driver role pending | `driver && !roleVerified` | Blocked on index |
| Email unverified | `emailVerificationRequired` | Success step messaging |
| No org context | `OrganizationContext` null | Empty/skeleton in app (edge case) |
| Team invite pending | `organization_members.status = invited` | Visible to **admins** only |
| Driver no fleet | no linked `drivers` rows | “Join organization” in passbook |
| Onboarding flag | `profiles.onboarding_completed` | **Never read/written** |

There is **no unified onboarding state machine** in DB or client — only implicit step indices in wizards.

---

## 13. Existing shared UI / patterns (recent work)

| Asset | Location | Notes |
|-------|----------|-------|
| Mobile shell | `SignUpMobileShell` | Progress footer, keypad vs scroll body |
| Keypad steps | `SignUpKeypadStepLayout` | Phone/OTP without OS keyboard |
| Text steps | `SignUpMobileTextStep` | Single-field full-page |
| Design tokens | `signUpMobileTokens.ts`, `signUpMobile.styles.ts` | Shared business + driver mobile |
| Location split | `CompanyLocationStep` | Address + city on own step |

Still **form-wizard** architecture, not persona-based onboarding modules.

---

## 14. Gap matrix (prioritized)

| # | Gap | Impact | Preserve on redesign |
|---|-----|--------|----------------------|
| G1 | Mock OTP only | No real phone trust | Add provider behind same step contract |
| G2 | `fleetSize` / `monthlyVolume` dropped | Bad data for hybrid/broker segmentation | Migration or metadata JSON if schema frozen |
| G3 | No team-join signup path | Duplicate orgs for invitees | Use `skip_org_creation` + invite token |
| G4 | No invitee inbox UI | Invites stall | New screen; keep RPCs |
| G5 | `onboarding_completed` unused | Can’t resume/setup | Wire to state machine |
| G6 | Single `user` persona | Fleet owner = broker = dispatcher UX | IA split, same `role` + metadata |
| G7 | Driver avatar seed local only | Profile incomplete | Set `avatar_seed` on signup |
| G8 | Google early-exit paths | Sparse org metadata | Enforce completion or post-OAuth wizard |
| G9 | Sign-in → welcome hop | Extra friction | Deep links per intent |
| G10 | No broker-specific onboarding | Wrong defaults for aggregate | `operating_model`-driven steps |

---

## 15. Target architecture (Phase 2 preview — not implemented)

### 15.1 Principles

1. **Persona-first routing** — Intent capture before forms (`/onboarding` hub).
2. **Progressive trust** — Phone → email → org → compliance (KYC) as tiers, not one form dump.
3. **Server-owned provisioning** — Keep `handle_new_user`; extend metadata contract only with migrations.
4. **Resumable onboarding** — `onboarding_completed` + `onboarding_step` / `onboarding_persona` (new columns if approved).
5. **Invite-aware signup** — Deep link `?invite=team|fleet&ref=…` sets `skip_org_creation` and skips org steps.
6. **One design system** — Shell, trust panels, step progress (reuse mobile tokens).

### 15.2 Proposed information architecture

```
/onboarding                    → Persona hub (business | driver | join team | join fleet)
/onboarding/business           → Module router
  /identity                    → Phone + real OTP
  /workspace                   → Org name + model
  /operations                  → Fleet / volume / employees (persist all fields)
  /location                    → Address + city
  /account                     → Credentials
  /verify-email                → Activation
/onboarding/driver
  /identity … /compliance … /account
/onboarding/join               → Invite token → accept → profile completion
/sign-in                       → Returning users
```

### 15.3 Persona modules (same DB, different journeys)

| Module | Steps | skip_org |
|--------|-------|----------|
| Business owner | Full workspace setup | false |
| Team invitee | Profile + accept invite | true |
| Driver self-serve | Identity + compliance + account | N/A (no org) |
| Driver fleet invite | Token → accept → minimal profile | N/A |

### 15.4 What we will NOT change in Phase 2 without migration review

- `handle_new_user` contract (extend, don’t fork)
- `organization_members` invite RPCs
- `profiles.role` enum behavior
- RLS policies on org/member inserts
- Existing `/sign-up` URLs (redirect to new IA)

---

## 16. Recommended implementation phases

| Phase | Deliverable |
|-------|-------------|
| **1** | This audit + stakeholder sign-off |
| **2** | IA + wireframes + metadata contract (incl. fleet/volume) |
| **3** | `OnboardingRouter` + persona hub; redirect legacy routes |
| **4** | Business module refactor (real OTP, persist fields, trust UI) |
| **5** | Team-join path + invite inbox |
| **6** | Driver module refactor + fleet invite deep links |
| **7** | `onboarding_completed` + resume + analytics |
| **8** | Broker/ops step variants driven by `operating_model` |

---

## 17. Key file index

```
app/welcome.tsx
app/sign-up.tsx
app/driver-signup.tsx
app/sign-in.tsx
app/auth/callback.tsx
app/index.tsx
components/AppBootGate.tsx
features/auth/signup/**
features/auth/services/auth.service.ts
contexts/AuthContext.tsx
contexts/OrganizationContext.tsx
features/organization/services/members.service.ts
features/drivers/services/drivers.service.ts
lib/capabilities.ts
lib/routes.ts
supabase/migrations/20260428141000_rename_fleet_size_to_employee_count.sql
supabase/functions/check-user-by-phone/
```

---

## 18. Phase 2 shipped (foundation)

| Item | Status |
|------|--------|
| Persona hub `/onboarding` | `features/onboarding/components/OnboardingPersonaHub.tsx` |
| Business wizard alias | `/onboarding/business` → `BusinessSignUpScreen` |
| Join team entry | `/onboarding/join-team` — sign-in guidance (invite inbox next) |
| Welcome → hub | Business card → `/onboarding` |
| `fleet_size_band` / `monthly_volume_band` in auth metadata | `auth.service.signUp` + OAuth pending |
| Boot allow-list | `/onboarding/*` in `AppBootGate` + `indexBootRedirect` |

**Still TODO:** real OTP, `skip_org_creation` signup module, invite inbox UI, `onboarding_completed`, org DB columns for fleet/volume bands.

---

*Generated for Pulse onboarding redesign.*
