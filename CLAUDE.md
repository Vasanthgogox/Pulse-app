# CLAUDE.md — Pulse (q-web)

## Efficiency Rules
- Inspect only files relevant to the task
- Follow imports one level deep
- No subagents unless asked
- No exhaustive verification unless asked
- No broad repo scans
- Prefer targeted fixes over analysis
- Reuse existing patterns
- Preserve architecture
- Never modify auth without approval

## Investigation Strategy
1. Start with files explicitly mentioned by the user
2. Follow imports one level deep
3. Load domain docs only when needed
4. Avoid Explore subagents unless requested
5. Prefer direct fixes over broad investigations
6. Stop when sufficient information is found

## Stopping Criteria
Stop investigating when:
- The root cause is identified
- A direct fix is possible
- Additional exploration is unlikely to change the solution

Do not continue searching for alternative explanations.

## Stack
React Native 0.81 · Expo SDK 54 · Expo Router 6 · TypeScript 5.9 · TanStack Query v5 · Supabase

## Key Conventions
- Routes: always `ROUTES.*` from `lib/routes.ts`
- Query keys: always `queryKeys.*` from `lib/queryKeys.ts`
- Theme: always `constants/Theme.ts` tokens — never raw colors
- Strings: always `lib/i18n.ts`
- Services: `features/[domain]/services/[name].service.ts`
- Query hooks: `lib/queries/use[X]Query.ts`

## Change Guide
| What | Where |
|------|-------|
| New API call | `features/[domain]/services/` |
| New screen | `app/[path].tsx` + `lib/routes.ts` |
| New query | `lib/queries/use[X]Query.ts` + `lib/queryKeys.ts` |
| Shared UI | `components/` |
| Feature UI | `features/[domain]/components/` |
| DB change | `supabase/migrations/` (new file only) + `npm run db:push` |

## Reference Docs (load only when relevant)
- Architecture & data flow → `docs/architecture.md`
- Auth & session → `docs/auth.md`
- Routing → `docs/routing.md`
- Conventions & naming → `docs/conventions.md`
- DB core tables → `docs/database/core.md`
- DB trips schema → `docs/database/trips.md`
- DB finance schema → `docs/database/finance.md`
- DB marketplace schema → `docs/database/marketplace.md`
- Trips domain → `docs/trips.md`
- Finance domain → `docs/finance.md`
- Network/marketplace → `docs/network.md`
- UI patterns → `docs/ui.md`
- Debugging & common errors → `docs/debugging.md`
- Architectural decisions → `docs/decisions.md`
- Commands & troubleshooting → `docs/commands.md`
- Code patterns → `docs/patterns.md`
- Performance & bottlenecks → `docs/performance.md`
- Anti-patterns → `docs/anti-patterns.md`
