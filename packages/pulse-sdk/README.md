# @pulse/sdk

**Public** Platform SDK for external workspaces and integrations.

**Status:** Phase 5 — after pilot **and** API freeze. Do not build now.

---

## Internal vs public

| Package | When | Audience |
|---------|------|----------|
| `@pulse/platform-runtime` | Phase 1A Sprints 2–4 | Monorepo services only |
| `@pulse/contracts` | Now (frozen v1) | All packages |
| `@pulse/sdk` | Phase 5 | External integrators + apps |

Use **`PlatformRuntime.executeCommand()`** inside the monorepo today. Public SDK wraps the same contracts later.

---

## Why wait on public SDK

- Contracts were still moving — now frozen at v1 envelopes
- Pilot must validate behavior before external semver promises
- Internal runtime reduces duplication without premature npm API surface

---

## Sequence

```
Sprints 1–5 (platform) → Commerce APIs → Pilot → Pact freeze → @pulse/sdk v1
```

See [oms/docs/ROADMAP.md](../../oms/docs/ROADMAP.md).
