# Pulse Milestones

> [PLATFORM_CANONICAL_MODEL.md](./PLATFORM_CANONICAL_MODEL.md) · [ROADMAP.md](./ROADMAP.md) · [REPOSITORY_LAYOUT.md](./REPOSITORY_LAYOUT.md)

---

## Phase 0 ✓

Canonical model · entity model · frozen contracts · Identity migrations drafted

---

## Phase 1A — Implementation (Sprints 1–5)

| Sprint | Deliverable | Package |
|--------|-------------|---------|
| **1** | Identity Service (6 endpoints only) | `packages/platform/identity` |
| **2** | Gateway — no direct service calls | `packages/platform/gateway` |
| **3** | Command Store + stale worker | `packages/platform/command-store` |
| **4** | Platform Timeline (append-only) | `packages/platform/timeline` |
| **5** | Observatory reads Timeline | `packages/platform/observatory` |

Cross-cutting: `packages/platform/runtime` (`PlatformRuntime.executeCommand`)

**Gate A:** Org + warehouse + login **< 15 min** (after Sprint 1)

---

## Customer proof (before new modules)

`Login → … → Invoice` end-to-end with one customer → then Configuration, Reference Data, Network, etc.

---

## Phase 1B — Commerce + Planning APIs

**Gate B:** 5 orders merged **< 30 sec**

---

## Phases 2–5

See [ROADMAP.md](./ROADMAP.md).
