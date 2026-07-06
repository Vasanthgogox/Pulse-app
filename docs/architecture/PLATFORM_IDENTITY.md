# Platform Identity Service

Bounded domain façade for Person, Membership, Invitation, Policy, and Workspace.
**Onboarding is a client** — business rules live here, not in onboarding screens.

## Architecture

```
Authentication (OTP, password, Google, Entra, Okta, SAML)
        ↓
Verified Identity
        ↓
PlatformIdentityService
        ├── Person + status
        ├── Memberships (relationshipType, role, lifecycle)
        ├── Invitations (proposedRelationshipType)
        ├── Policy Engine v1 → PolicyDecision[]
        ├── Workspace context (permissions, features)
        └── Audit events
        ↓
Clients: Mobile App · Onboarding · Admin Portal · API · Partner Portal
```

## Façade API (`lib/platform-identity`)

| Method | Purpose |
|--------|---------|
| `evaluateJoin(input)` | Policy engine v1 — employment, person status, org status |
| `resolveInvitations({ identities })` | Channel-agnostic invitation lookup |
| `resolveOnboardingContext(input)` | Onboarding UI routing (client) |
| `acceptInvitation(input, deps)` | Policy → accept RPC → workspace |
| `switchWorkspace({ organizationId, deps })` | Set active workspace + rebuild caches |
| `getCurrentWorkspace()` | `PlatformWorkspaceContext` |
| `listMemberships()` | Person's memberships |
| `recordIdentityVerified(...)` | Audit: phone/email/SSO verified |

```typescript
import { platformIdentityService } from '@/lib/platform-identity';

const policy = await platformIdentityService.evaluateJoin({ ... });
const invites = await platformIdentityService.resolveInvitations({ identities });
await platformIdentityService.acceptInvitation({ inviteId }, deps);
```

## Authentication ≠ Identity

| Layer | Question |
|-------|----------|
| **Authentication** | Can you prove who you are? (OTP, SSO, password) |
| **Identity** | Who are you within Pulse? (Person, verified identities) |

## Workspace (first-class)

```typescript
PlatformWorkspaceContext {
  personId, activeOrganizationId, activeMembershipId,
  relationshipType, role, permissions, features, locale
}
```

Every API request should derive authorization from workspace context via `getWorkspaceRequestContext()`:

```typescript
import { getWorkspaceRequestContext, withWorkspaceContext } from '@/lib/platform-identity';

const { workspace, headers } = await getWorkspaceRequestContext();
// headers include Authorization, X-Pulse-Organization-Id, X-Pulse-Person-Id, X-Pulse-Membership-Id

await withWorkspaceContext(async (ctx) => fetch('/api/...', { headers: ctx.headers }), {
  requireOrganization: true,
});
```

`ActiveWorkspaceContext` syncs into `workspaceContextStore` on load and switch so `getCurrentWorkspace()` stays aligned with the UI.

## Organization status

```typescript
OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'DELETED'
```

Join/switch blocked when org is not `ACTIVE` — evaluated by `organization_status_v1`.

## Policy engine v1

Composable evaluators → `CombinedPolicyResult`:

```
person_status_v1
employment_v1
organization_status_v1
identity_provider_v1   (SSO / corporate email / phone requirements)
invitation_v1          (invitation expiry / already-accepted)
(future: compliance_v1, geographic_v1, licensing_v1)
        ↓
combinePolicyDecisions() → { allowed, decisions, primaryBlock }
```

Structured block example:

```typescript
{
  allowed: false,
  reason: 'ACTIVE_EMPLOYMENT_EXISTS',
  requiredActions: ['LEAVE_ORGANIZATION'],
}
```

## Separated utilities (never shared)

| Module | Responsibility |
|--------|----------------|
| `invitationPicker.util.ts` | Choose pending invite |
| `workspaceSwitcher.util.ts` | Switch active org UI |
| `membershipPolicyEngineV1` | Policy evaluation |

## Delegated administration

Permissions (`members.invite`, `sso.configure`, …) are **independent of relationshipType**.
Fleet admin scope: invite/view/remove members — not archive org or change SSO.

## Audit trail

`recordPlatformIdentityAudit()` — immutable events (in-memory buffer + async DB persist):

- `invitation.accepted`, `employment.rejected`, `workspace.switched`
- `identity.phone_verified`, `identity.sso_linked`, `membership.terminated`

Persisted to `platform_identity_audit_events` when migration `20261107050000` is applied; non-fatal if table missing.

## Module layout

```
lib/platform-identity/
  platformIdentity.service.ts   ← façade
  index.ts
  types/                        authentication, workspace, organizationStatus, permissions
  workspace/workspaceContextStore.ts
  api/workspaceRequestContext.ts
  policy/
    policyDecision.ts
    membershipPolicyEngineV1.ts
    evaluators/
  audit/
    platformIdentityAudit.ts
    platformIdentityAuditPersistence.ts

lib/onboarding/               ← clients (UI routing, branding, pending storage)
```

## Migration path

1. **Done:** Façade + v1 policy engine + workspace store + API request context helpers.
2. **Done:** Audit persistence stub + `organizations.platform_status` migration.
3. **Done:** `emailIdentityProvider` verifies against the real Supabase session and resolves invitations via `resolve_pending_team_invitations_by_email`; `ssoIdentityProvider` verifies Google via the session's linked identities. Entra/Okta/Auth0/SAML remain explicit "not configured" until those IdPs are registered with Supabase Auth.
4. **Done (Architecture Freeze Review + cutover):** Removed `lib/onboarding/completeOnboarding.util.ts`, `employmentPolicy.ts`, and the deprecated `membershipPolicyEngine.ts`/`evaluateMembershipPolicyV1` — all confirmed to have zero remaining callers once `MembershipPolicyRequiredAction` was relocated into `policyDecision.ts`. `platformIdentityService.acceptInvitation()`/`.switchWorkspace()` and `membershipPolicyEngineV1.evaluateJoinPoliciesV1()` are now the sole implementations for onboarding orchestration and membership policy, respectively.
5. **Next:** Wire Edge Functions / REST proxies to validate `X-Pulse-Organization-Id`.
6. **Next:** SCIM / Entra / Okta providers register on `IdentityProvider` registry.

See also: [TEAM_INVITATION_ONBOARDING.md](./TEAM_INVITATION_ONBOARDING.md)
