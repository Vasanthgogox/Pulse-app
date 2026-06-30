# Business services

Bounded-context APIs. Each service owns its database and calls `PlatformRuntime` for commands.

| Service | Status |
|---------|--------|
| commerce/ | Phase 1B — first Platform consumer |
| planning/ | Phase 1B |
| execution/ | Phase 3 |
| finance/ | Post pilot |
| network/ | **Postponed** until customer proof flow |

## Rule

```
apps → Gateway → services → PlatformRuntime → Command Store + Timeline
```

Never: `apps → service URL` or `apps → Supabase`.
