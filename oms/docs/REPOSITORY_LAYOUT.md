# Repository Layout

**Purpose:** Make Platform vs Business ownership obvious as the team grows.

Phase 1A is **implementation only** — code lands in these paths.

---

## Structure

```
packages/
├── contracts/              # Frozen Command + Event envelopes (@pulse/contracts)
├── types/                  # Shared DTOs re-exporting contracts (future)
└── platform/               # Platform team — internal until Phase 5 public SDK
    ├── runtime/            # PlatformRuntime.executeCommand() — all services use this
    ├── gateway/
    ├── identity/
    ├── command-store/
    ├── timeline/
    ├── observatory/
    ├── configuration/      # Sprint after platform proof (not 1A)
    └── reference-data/     # Sprint after platform proof (not 1A)

services/                   # Business bounded contexts
├── commerce/
├── planning/
├── execution/
├── finance/
└── network/                # Postponed until customer proof flow

apps/
├── commerce-ui/              # oms/ today
├── execution-ui/             # future
└── finance-ui/               # future
```

---

## Rules

| Layer | May call | Must not |
|-------|----------|----------|
| **apps/** | Gateway (HTTP) | Service DBs, Supabase directly |
| **services/** | `PlatformRuntime`, own DB | Sibling services, Timeline inserts |
| **packages/platform/** | Platform DB schemas | Business entity tables |
| **packages/contracts/** | — | Runtime logic (types only) |

---

## Internal Platform Runtime

Business services **do not** hand-write:

```sql
INSERT INTO command_store ...
INSERT INTO platform_timeline ...
```

They call:

```typescript
PlatformRuntime.executeCommand(envelope, handler);
```

Which automatically: validates schema · records command · writes timeline · publishes event · returns response.

Public `@pulse/sdk` (Phase 5) wraps the same contracts for external integrators. Internal `packages/platform/runtime` ships first.

---

## Current mapping

| Path | Today | Target |
|------|-------|--------|
| `oms/` | Commerce UI prototype | `apps/commerce-ui` |
| `packages/pulse-sdk/` | Deferred public SDK | Phase 5 |
| `packages/platform/runtime/` | New — internal runtime | Sprint 2+ |
| `supabase/migrations/` | Identity + legacy fleet | Platform migrations prefixed by domain |

---

## Postponed (until customer proof flow)

Do not build until one customer completes:

`Login → Org → Warehouse → Product → Customer → Order → Plan → Publish → Dispatch → POD → Settlement → Invoice`

**Postponed modules:** Feature Flags · Notifications · Search · AI Agents · Marketplace · Fleet · Talent

---

## Related

- [ROADMAP.md](./ROADMAP.md) — Phase 1A sprints
- [contracts/COMMAND_ENVELOPE.md](./contracts/COMMAND_ENVELOPE.md)
- [contracts/EVENT_ENVELOPE.md](./contracts/EVENT_ENVELOPE.md)
