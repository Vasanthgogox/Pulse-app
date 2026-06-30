# Pulse Platform Roadmap

**Priority model:** Customers → Feedback → Iteration

> **Constitution:** [PLATFORM_CANONICAL_MODEL.md](./PLATFORM_CANONICAL_MODEL.md)  
> **Physical model:** [PLATFORM_ENTITY_MODEL.md](./PLATFORM_ENTITY_MODEL.md)  
> **Repo layout:** [REPOSITORY_LAYOUT.md](./REPOSITORY_LAYOUT.md)  
> **Frozen contracts:** [contracts/COMMAND_ENVELOPE.md](./contracts/COMMAND_ENVELOPE.md) · [contracts/EVENT_ENVELOPE.md](./contracts/EVENT_ENVELOPE.md)

---

## Priority order (locked)

```
0. Platform Canonical Model + Entity Model + Contracts  ✓ documented
1A. Pulse Platform Foundation — IMPLEMENTATION ONLY (Sprints 1–5)
1B. Commerce + Planning APIs (first Platform consumer)
2. Pilot customer — full proof flow
3. Execution Service
4. Consumer contracts (Pact) + API freeze
5. @pulse/sdk v1 (public)
```

---

## Phase 1A — Implementation only (Sprints 1–5)

Design is frozen. Build in order.

### Sprint 1 — Identity Service

**Only these endpoints. Nothing else.**

| Method | Path |
|--------|------|
| `POST` | `/auth/login` |
| `GET` | `/auth/me` |
| `POST` | `/organizations` |
| `POST` | `/business-units` |
| `POST` | `/warehouses` |
| `POST` | `/users/invite` |

Package: `packages/platform/identity/`  
Contract: [api/identity-v1.yaml](./api/identity-v1.yaml)  
Schema: `supabase/migrations/202611060001`–`004`

**Exit:** Commerce onboarding calls Identity API — no localStorage, no mock identity.

---

### Sprint 2 — Gateway

**Every request.** No service is directly callable.

```
Client → Gateway → Command Store (RECEIVED) → Identity validation → Commerce Service
```

Package: `packages/platform/gateway/`

**Exit:** OMS cannot call Commerce or Identity URLs directly; all traffic through Gateway.

---

### Sprint 3 — Command Store

Exactly as documented. **Stale timeout worker from day one.**

```
RECEIVED → PROCESSING → COMPLETED
                ↓ timeout
              STALE → RETRYING → COMPLETED | FAILED
```

Package: `packages/platform/command-store/`  
Business services use `PlatformRuntime.executeCommand()` — never insert commands directly.

---

### Sprint 4 — Platform Timeline

Append-only. **Never update. Never delete.**

- One timeline entry per command
- One timeline entry per event

Package: `packages/platform/timeline/`  
Only Gateway / PlatformRuntime writes rows.

---

### Sprint 5 — Observatory

**Do not improve UI.** Read from Timeline instead of in-memory logs.

Package: `packages/platform/observatory/`

**Exit:** Publish plan trace visible from Timeline projection.

---

### Internal Platform Runtime (Sprint 2–4)

`packages/platform/runtime/` — `PlatformRuntime.executeCommand()`:

1. Validates schema  
2. Records command  
3. Writes timeline  
4. Publishes event  
5. Returns response (idempotent replay)

Public `@pulse/sdk` waits until Phase 5. Internal runtime ships now.

---

## Phase 1A — Definition of Done

Platform sprints 1–5 complete **and** Commerce can run the proof flow through Gateway:

```
Login → Org → Warehouse → Product → Customer → Order → Plan → Publish
  → Command Store → Timeline → Observatory
```

No localStorage · no mock identity · no UI→DB · no direct service URLs.

**Gate A (Sprint 1):** Org + warehouse + login **< 15 minutes**

---

## Customer proof flow (platform exists when this works)

Do not add modules until **one real customer** completes:

```
Login → Create Organization → Create Warehouse → Create Product
  → Create Customer → Create Order → Create Execution Plan → Publish
  → Dispatch → Driver POD → Settlement → Invoice
```

**Postponed until proof flow succeeds:**

Feature Flags · Notifications · Search · AI Agents · Marketplace · Fleet · Talent · Configuration · Reference Data

---

## Phase 1B — Commerce + Planning APIs

Commerce becomes UI + orchestration. APIs behind Gateway + PlatformRuntime.

**Gate B:** First order **< 2 min** · 5 orders merged **< 30 sec**

---

## Phases 2–5

| Phase | Focus |
|-------|-------|
| **2** | Pilot customer |
| **3** | Execution Service (replace mock) |
| **4** | Pact + API freeze |
| **5** | Public `@pulse/sdk` v1 |

---

## Repository layout

```
packages/platform/   ← Gateway, Identity, Command Store, Timeline, Observatory, runtime
packages/contracts/  ← Frozen envelopes
services/            ← commerce, planning, execution, finance
apps/                ← commerce-ui (oms/), execution-ui, finance-ui
```

See [REPOSITORY_LAYOUT.md](./REPOSITORY_LAYOUT.md).

---

## Current status

| Sprint | Status |
|--------|--------|
| Contracts frozen | ✓ `@pulse/contracts` + docs |
| Entity model + Identity migrations | ✓ ready to push |
| Sprint 1 Identity Service | **Implement** |
| Sprint 2 Gateway | Not started |
| Sprint 3 Command Store | Not started |
| Sprint 4 Timeline | Not started |
| Sprint 5 Observatory | Not started |
| PlatformRuntime | Interface stub only |

---

## Decision filter

1. Which **Sprint 1–5** item does this advance?
2. Does it call **Gateway** / **PlatformRuntime**?
3. Is it on the **postponed** list? → defer.
4. Public SDK, Marketplace, AI agents? → defer.
