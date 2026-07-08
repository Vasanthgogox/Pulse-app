# @pulse/platform-testing

Shared test utilities for Pulse platform services.

## Contents

| Module | Purpose |
|--------|---------|
| `fixtures/*` | Tenant, org, BU, warehouse, auth user builders |
| `fixtures/ids` | Canonical ID regex (`ORG-000001`, etc.) |
| `jwt/helpers` | Mint platform JWTs (expired, wrong tenant, invalid sig) |
| `api/identity-client` | Typed HTTP client + envelope assertions |
| `contract/*` | Zod schemas aligned with `identity-v1.yaml` |
| `architecture/repository-isolation` | Static scan for Supabase leaks |
| `permissions/matrix` | Role → permission matrix for Identity v1 |

## Usage

```bash
# Install from the repo root — this package is an npm workspace member,
# the root package-lock.json is the only authoritative lockfile
npm run build
```

```typescript
import {
  buildOrganizationFixture,
  mintRoleJwt,
  assertContractData,
  identityV1Schemas,
} from '@pulse/platform-testing';
```

Every future service (Commerce, Planning, Execution, Finance) should depend on this package for integration tests — not copy fixtures.
