---
description: Run an act→verify→adjust loop on a task until Pulse's verify gates pass or you're blocked
argument-hint: <task description, e.g. "fix trip expense total not updating">
---

# /loop — Pulse verification loop

Drive the task in `$ARGUMENTS` through a repeating **act → observe → adjust** cycle until the
verify gates pass or you hit a genuine blocker. This is loop engineering: optimize for a *verified*
final outcome, not a good first response.

## Rules (inherit CLAUDE.md — these are non-negotiable)
- No subagents unless the user explicitly asked in the task text.
- No whole-repo scans. Start from files named in the task; follow imports one level deep only.
- Targeted fixes over investigations. Stop searching once the root cause is found.
- Reuse existing patterns; preserve architecture. Never touch auth without approval.
- Use `ROUTES.*`, `queryKeys.*`, `Theme.ts` tokens, `i18n.ts` strings — never raw values.
- Hermes safety: no bare `crypto.*` on the client (use `uuidv7()`); guard `window.location`.

## The loop

**1. Intent** — Restate the goal as one checkable sentence. If it's not checkable
(no clear "done" condition), ask ONE clarifying question, then proceed.

**2. Context** — Read only what the task points at, plus imports one level deep. Stop when you
have enough to act.

**3. Action** — Make the smallest change that could satisfy the intent.

**4. Observe** — Run the verify gates in order, cheapest first. Stop at the first failure and read
the actual output:
```
npm run typecheck      # tsc --noEmit — fastest signal
npm run lint           # eslint on changed files
npm test               # jest — run only relevant tests, e.g. jest lib/navigationPolicy
```
For web-UI changes also consider: `npm run test:web` (Playwright).
Prefer scoping tests/lint to the files you touched — do NOT run the full suite every iteration.

**5. Adjust** — If a gate fails, read the error, revise, and return to step 3. If it passes,
move to the next gate. When all relevant gates pass, the loop is done.

## Stopping criteria (stop and report — do not keep looping)
- ✅ All relevant verify gates pass → done.
- 🚧 Blocked: same gate fails twice the same way, needs a decision, or needs auth/DB/deploy
  approval → stop and surface it. Don't thrash.
- ❓ Intent was never checkable and can't be made so → ask.

## Report (per CLAUDE.md "How to report finished work")
- **Done:** one sentence on what now works.
- **Changed:** ≤5 plain-English bullets (what + why).
- **You do:** any leftover steps (commands to run, things to check) — skip if none.
- If anything is untested/unfinished, say so in one line.

Task: **$ARGUMENTS**
