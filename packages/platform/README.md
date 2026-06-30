# Pulse Platform packages

Internal platform services for Phase 1A. **Not** the public `@pulse/sdk` (Phase 5).

## Packages

| Package | Sprint | Responsibility |
|---------|--------|----------------|
| [runtime](./runtime/) | 2–4 | `PlatformRuntime.executeCommand()` — orchestrates all cross-cutting concerns |
| [gateway](./gateway/) | 2 | Sole external entry; identity validation; correlation IDs |
| [identity](./identity/) | 1 | Auth, org, BU, warehouse, memberships, invites |
| [command-store](./command-store/) | 3 | Command lifecycle + stale timeout worker |
| [timeline](./timeline/) | 4 | Append-only operational history |
| [observatory](./observatory/) | 5 | Read Timeline projections (no in-memory source of truth) |
| configuration/ | Post-proof | Tenant settings — **postponed** |
| reference-data/ | Post-proof | Read-only lookups — **postponed** |

## Rule

Business code in `services/` calls `PlatformRuntime` — never inserts Timeline or Command Store rows directly.

See [oms/docs/REPOSITORY_LAYOUT.md](../../oms/docs/REPOSITORY_LAYOUT.md).
