# CLAUDE.md — Pulse (q-web)

## Agent Policy
- Do NOT spawn subagents unless explicitly asked
- Always attempt the task yourself first
- Use at most one specialist subagent, and only if truly necessary
- Never recursively spawn subagents
- Prefer cheaper models (Haiku) for research/explore work; reserve Opus for critical review

## Context Hygiene
- When a feature, audit, or debugging task is complete, remind me to run /compact before continuing
- Keep Supabase queries targeted: use LIMIT, COUNT(*), or explicit columns — never SELECT *

## Skill Restrictions
- Never auto-invoke artifact-design unless the user explicitly asks to build a UI component, page, or visual artifact
- For analysis, schema review, or consulting tasks: plain text output only — no artifacts, no design system, no colors, no typography

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

## Runtime & Ops Context

### Sentry
- Org slug `gogox-gr`, region `https://de.sentry.io`
- Projects: `gx-pulse` (web + Android prod) and `react-native`
- Live release: `pulse@1.0.0`

### Hermes / RN platform gotchas
- No global `crypto` on Android Hermes — never call `crypto.randomUUID()` / `crypto.getRandomValues()` bare on the client. Use `uuidv7()` from `lib/uuidv7.ts` (or an existing local Hermes-safe `randomUUID()`). Bare `crypto.*` is fine only in `supabase/functions/*` (Deno) and `oms/`, `packages/platform/*` (Node).
- RN polyfills a global `window` but NOT `window.location` — guard both (`typeof window === 'undefined' || !window.location`) before reading `location.*`.
- Maps: MapLibre in standalone builds, `react-native-maps` only in Expo Go — always go through the compat shims (`lib/mapLibreCompat.*`, `components/driver/LeafletMap.*`), never import `react-native-maps` directly.

### Known Sentry noise (do NOT "fix" in code)
- `AsyncRequireError: Loading module … failed` = stale chunk after a Netlify redeploy; recovery listeners already reload. Ignore.
- `[AuthGuard] refresh_invalid_session_cleared` = expected warning-level auth signal (session cleared on expiry), funneled via `captureMessage`. Ignore.

### Deploy
- Web → Netlify (`gx-pulse.netlify.app`). Native → new build required; no OTA (`ota_updates` disabled), so client-side fixes need a fresh Android/iOS build.

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
- **Operating model RBAC (Asset / Aggregate / Hybrid)** → `docs/RBAC_OPERATING_MODEL.md`
- **RBAC change log (new / modified files)** → `docs/RBAC_OPERATING_MODEL_CHANGELOG.md`
- Architecture & data flow → `docs/architecture.md`
- Auth & session → `docs/auth.md`
- Routing → `docs/routing.md`
- Conventions & naming → `docs/conventions.md`
- **Trip variants (3 creation flows, two-row rule, traps)** → `docs/TRIP_VARIANTS.md`
- **DB query guide (live schema, FKs, enums, traps, health)** → `docs/database/QUERY_GUIDE.md`
- DB core tables → `docs/database/core.md`
- DB trips schema → `docs/database/trips.md`
- DB finance schema → `docs/database/finance.md`
- DB marketplace schema → `docs/database/marketplace.md`
- Trips domain → `docs/trips.md`
- Finance domain → `docs/finance.md`
- Network/marketplace → `docs/MARKETPLACE_DOMAIN.md` (Marketplace Platform M0–M5); short pointer `docs/network.md`
- Product strategy (KPIs, dual streams, M2 tiers) → `docs/PRODUCT_STRATEGY.md`
- Platform Consumer Rule (Trip + Marketplace) → `docs/PLATFORM_CONSUMER_RULE.md`
- UI patterns → `docs/ui.md`
- Debugging & common errors → `docs/debugging.md`
- Architectural decisions → `docs/decisions.md`
- Commands & troubleshooting → `docs/commands.md`
- Dev URLs & ports (localhost map) → `docs/DEV_URLS.md`
- Code patterns → `docs/patterns.md`
- Performance & bottlenecks → `docs/performance.md`
- Anti-patterns → `docs/anti-patterns.md`

## How to explain findings (STRICT — THIS IS THE DEFAULT REPLY FORMAT)

**This is the default way to answer me. Not an opt-in mode.**
Use it for every substantive reply: root-cause answers, "why" questions,
bug explanations, finished-work reports, refusals, blocked work, risk
call-outs, and any time I say a reply was unclear.
This rule OVERRIDES the global "concise / under 8 lines / no explanations /
max 5 items" preferences. When in doubt, USE THIS FORMAT.

Only skip it for: one-line factual answers ("yes", a file path, a command),
and pure conversational back-and-forth with no finding in it.

**If I ask you to explain, justify, or flag something — including when you are
declining or stopping work — that reply MUST use these headings.** Writing a
wall of prose instead is a rule violation, even when the content is correct.

Write for a reader who has not seen the code. Plain English, short sentences,
one idea per line. Never chain technical facts into a dense paragraph.

Adapt the headings to fit the reply — drop the ones that don't apply
(e.g. no bug → no "real bug" section), but keep the shape, the ✅/❌ lists,
the tables, and ALWAYS keep "In one sentence" last.

Required structure — use these headings:

1. **What's the issue?** — if I had a wrong assumption, state it as
   "You thought: …" then "Checking the data shows: …" with ❌ / ✅ lines.
   Say plainly whether anything is actually broken or lost *yet*.
2. **What is the real bug?** — walk it as numbered steps in the order it
   happens in real life (Step 1: someone clicks X → Step 2: system stores Y →
   Step 3: other code checks Z). Show the record/state as a ✅/❌ field list.
   End by naming the contradiction outright:
   "Earlier code: ✅ … / Later code: ❌ … These two disagree. That's the bug."
3. **Why is this bad?** — separate "right now" from "when X happens".
   Show the wrong output vs the correct output side by side.
4. **Why does <confusing detail> matter?** — pre-empt anything I'd stumble on
   (a field being 0, a null, an odd name) as its own mini-heading.
5. **Proposed fixes** — number them, label each as immediate-code vs
   product/UI, and say what each one covers. Include rough size ("~6 lines").
6. **In one sentence** — a single plain-English wrap-up I could forward to
   someone else unchanged.

Rules:
- Explain every technical term the first time, or avoid it
- Show data as labelled ✅/❌ lists or tiny tables, never as raw SQL rows
- Repetition for clarity is REQUIRED, not a flaw — length is fine
- State clearly what is NOT broken, so I know the blast radius
- Applies to bad news too: if you stop, refuse, or hit a risk, explain it
  in this format — never as a prose paragraph
- Say plainly if something is untested or unverified, as its own line
- If I was right, say so; if I was partly wrong, correct that specific part first

## RBAC sessions
When the user asks about roles, asset vs aggregate, give-load, suppliers, garage, or page/modal access: load `docs/RBAC_OPERATING_MODEL.md` first, implement via `useCapabilities` / `ModelAccessGate`, then append rows to `docs/RBAC_OPERATING_MODEL_CHANGELOG.md`.
