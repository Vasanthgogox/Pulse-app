# Pulse Navigation Policy — Staging Validation Plan

**Scope:** Client navigation policy (session / experience / onboarding / returnTo)  
**Out of scope:** RLS data correctness (note failures separately if APIs 403)  
**Environment:** Staging URL (Netlify) + iOS/Android builds against staging Supabase  
**Kill switch:** Confirm `EXPO_PUBLIC_NAV_POLICY_ENFORCE` is **on** (unset or `1`) unless testing kill-switch rollback  
**Owner:** QA + one engineering watcher for console  

**Pass rule:** Step matches **Expected**. Any unexpected redirect, blank forever, wrong shell, or loop = **Fail**.

---

## Preconditions

| ID | Action |
|----|--------|
| P0 | Staging app URL + native builds recorded |
| P1 | Test accounts: **Org A** (aggregated and/or asset), **Driver D**, optional incomplete-onboarding org |
| P2 | Browser: Chrome latest; one Incognito window ready |
| P3 | DevTools open: Console + Network; preserve log on navigation |
| P4 | Note current path after every step |

**Personas**

| Alias | Meaning |
|-------|---------|
| Anon | Signed out |
| Org | `profiles.role = user` |
| Driver | `profiles.role = driver` |

---

## 1. Authentication

| ID | Steps | Expected | Evidence |
|----|--------|----------|----------|
| A1 | Incognito → open staging root `/` | Web: land on `/terminal-website` (or replace toward it). No org/driver shell. | Pass/Fail · Screenshot · Console | - pass
| A2 | Anon open `/sign-in` | Sign-in UI. No bounce loop. | Pass/Fail · Screenshot | - when reloaded flicker 1 time 
| A3 | Sign in as Org | Lands org home (last tab or `/trips`). Splash ≤ restore time. No flash of driver shell. | Pass/Fail · Screenshot · Console | pass
| A4 | Soft refresh (F5) on `/trips` | Stay org trips (or last org tab). Brief splash OK. No sign-in. | Pass/Fail · Screenshot | pass
| A5 | Sign out from org UI | Land public auth or marketing. Protected URLs denied. | Pass/Fail · Screenshot | pass
| A6 | Sign in as Driver | `/(driver)` (or driver home). No org tabs chrome. | Pass/Fail · Screenshot | pass
| A7 | Soft refresh on driver home | Stay driver. No org bounce. | Pass/Fail · Screenshot | pass 
| A8 | Sign out as Driver | Public / sign-in. Anon. | Pass/Fail | pass
| A9 | Simulate expired session (force expire / wait TTL if tooling exists) on `/finance` | Redirect `/sign-in` with `returnTo` toward finance (or sign-in). No app crash. | Pass/Fail · Console · Network |
| A10 | Cold open staging after prior login (token restore) | Restore → persona home without wrong shell flash longer than splash. | Pass/Fail · Video preferred |
| A11 | Login Org → logout → login Driver (same browser) | Ends driver; no stuck org splash. | Pass/Fail · Console |
| A12 | Kill switch smoke (eng only): set enforce `0`, reload protected URL, restore `1` | With `0`: no Actor redirects (legacy/gaps may show). With `1`: policy enforces again. Document only; revert before other cases. | Pass/Fail · Console |

---

## 2. Deep Links

Replace `:id` with a real staging trip/public-profile id.

| Route | Signed out (Anon) | Signed in Org | Signed in Driver |
|-------|-------------------|---------------|------------------|
| `/workspace` | → `/sign-in?returnTo=…workspace…` | Stay `/workspace` | → `/(driver)` |
| `/trips` | → `/sign-in?returnTo=…trips…` | Stay trips | → `/(driver)` |
| `/finance` | → `/sign-in?returnTo=…finance…` | Stay (soft UI if no finance grant OK) | → `/(driver)` |
| `/resources` | → `/sign-in?returnTo=…` | Stay | → `/(driver)` |
| `/trip/:id` | → `/sign-in?returnTo=…` | Stay trip detail (data RLS separate) | → `/(driver)` (org trip shell denied) |
| `/pulse-loads` | → `/sign-in?returnTo=…` | Stay | → `/(driver)` |
| `/public-profile/:type/:id` | Stay public profile | Stay | Stay |
| `/terminal-website` | Stay marketing | Stay (or allow) | Stay |
| `/auth/callback` | Process runs; no premature strip to trips | Completes OAuth; no infinite replace | Same as org/driver post-callback persona |
| `/auth/reset-password` | Reset UI / token flow; not forced to trips mid-token | Allow complete reset | Allow complete reset |
| `/sign-in` | Stay | May navigate suite/home after session (OK) | Same |
| `/onboarding/business` | Stay process | Stay if branding incomplete | N/A / allow process |
| `/driver-signup` | Stay | Allow if needed | Stay when signup-success flag |

**Per-route table for QA (copy/paste)**

| ID | URL | Persona | Actual path | Expected path | Pass? |
|----|-----|---------|-------------|---------------|-------|
| D1 | `/workspace` | Anon | | `/sign-in?returnTo=…` | |
| D2 | `/workspace` | Org | | `/workspace` | |
| D3 | `/workspace` | Driver | | `/(driver)` | |
| D4 | `/trips` | Anon | | `/sign-in?returnTo=…` | |
| D5 | `/trips` | Org | | `/trips` | |
| D6 | `/trips` | Driver | | `/(driver)` | |
| D7 | `/finance` | Anon | | `/sign-in?returnTo=…` | |
| D8 | `/finance` | Org | | `/finance` | |
| D9 | `/finance` | Driver | | `/(driver)` | |
| D10 | `/resources` | Anon / Org / Driver | | as table | |
| D11 | `/trip/{id}` | Anon / Org / Driver | | as table | |
| D12 | `/pulse-loads` | Anon / Org / Driver | | as table | |
| D13 | `/public-profile/…` | Anon / Org / Driver | | stay | |
| D14 | `/auth/callback` | Anon→Auth | | complete → persona home | |
| D15 | `/auth/reset-password` | Anon | | stay on reset until done | |

**ReturnTo round-trip**

| ID | Steps | Expected |
|----|--------|----------|
| D20 | Anon open `/finance` → land sign-in → login Org | After login, land `/finance` (or suite destination if suite params win—record which) |
| D21 | Anon open `/workspace` → login Org | Land `/workspace` |
| D22 | Craft `/sign-in?returnTo=https://evil.com` | Ignored / falls back safe path (not external) |

---

## 3. Netlify (Expo Web)

Run while **Org** and again while **Anon** (and sample **Driver**).

| ID | Scenario | Steps | Expected |
|----|----------|--------|----------|
| N1 | Hard refresh | On `/finance`, Cmd/Ctrl+Shift+R | Same persona outcome as soft refresh; wait/splash OK; no wrong shell |
| N2 | Direct URL | Paste full staging URL `/trip/{id}` in new tab | Policy as §2; restore wait first |
| N3 | Bookmark | Bookmark `/workspace`; reopen later signed in | Opens workspace |
| N4 | Browser back | From `/finance` → navigate `/trips` → Back | History sane; no infinite Actor loop |
| N5 | Browser forward | After Back, Forward | Returns without crash |
| N6 | Incognito | Anon hard URL `/trips` | Sign-in + returnTo |
| N7 | Cache disabled | DevTools → Network → Disable cache; hard refresh `/trips` | Same as N1 |
| N8 | Marketing | Direct `/terminal-website` anon | Stay; no sign-in |
| N9 | SPA rewrite | Unknown path `/this-is-not-a-route-xyz` | Fail-closed: anon→sign-in; auth→org home `/trips` (or not-found policy)—record actual |

**Evidence:** Pass/Fail · Screenshot (before/after) · Console · for N1/N2 Video preferred

---

## 4. Native (Android + iOS)

Repeat for each OS.

| ID | Scenario | Expected |
|----|----------|----------|
| M1 | Cold launch signed out | Native anon `/` → **sign-in** (not marketing) |
| M2 | Cold launch Org | Session restore → org shell |
| M3 | Cold launch Driver | → driver shell |
| M4 | Warm launch (background → foreground) | Same persona; no spurious sign-in |
| M5 | Resume after 5+ min | Restore or re-auth cleanly |
| M6 | Force-kill app → reopen | Same as cold + restore |
| M7 | Deep link / universal link to `/trips` anon | Sign-in + returnTo when supported |
| M8 | Deep link `/trip/{id}` Org | Trip detail |
| M9 | Deep link `/trips` Driver | Bounce to driver home |
| M10 | Airplane → online during restore | Wait/retry; no wrong persona flash |

**Evidence:** Pass/Fail · Screenshot · Video for M1/M6/M7 · Device log if fail

---

## 5. OAuth / auth flows

| ID | Flow | Steps | Expected |
|----|------|--------|----------|
| O1 | Google login Org | Start Google from sign-in | `/auth/callback` completes; org home; **no** mid-token divert to `/trips` |
| O2 | Google login Driver | Same | Driver home |
| O3 | Magic link (if enabled) | Request + open email link | Completes; correct persona |
| O4 | Password reset | Forgot → email → `/auth/reset-password` | Stay on reset until success; then sign-in |
| O5 | Invite accept | Open invite link signed out | Land invite/onboarding process; after auth correct role |
| O6 | Email verification (if used) | Open verify link | Completes; no redirect loop |
| O7 | Expired OAuth/reset token | Open stale link | Error UX; not blank; not org tabs flash |
| O8 | Invalid token | Tampered hash/query | Safe error; public_process not stripped to finance |
| O9 | Incomplete owner / branding | Account that sets owner incomplete or branding flag | Redirect **once** to `/onboarding/business` (not competing with driver home) |
| O10 | Driver signup success flag | Account/flag active on `/trips` | `/driver-signup` once, not `/(driver)` first |

**Evidence:** Pass/Fail · Screenshot · Network (callback 200s) · Video for O1/O4

---

## 6. Multi-tab

Two tabs, same origin, Org session.

| ID | Steps | Expected |
|----|--------|----------|
| T1 | Tab A `/trips`, Tab B `/finance` → logout Tab A | Tab B on next focus/nav → signed out / sign-in; no crash |
| T2 | Both signed out → login Tab A | Tab B eventually session or on next nav shows Org |
| T3 | Leave tabs idle until refresh if visible | Re-eval without full reload when auth updates |
| T4 | Expire session (if injectable) Tab A | Both tabs move to sign-in without loop |

**Evidence:** Pass/Fail · Screenshot both tabs · Console both · Video T1

---

## 7. Regression (happy path)

Login as Org unless noted.

| ID | Area | Smoke | Expected |
|----|------|--------|----------|
| R1 | Trips | Open list → open trip → back | Data loads; no bounce to sign-in |
| R2 | Finance | Open fiscal tab | Loads or soft empty; stay on finance |
| R3 | Resources | Open resources | Stay |
| R4 | Workspace | Open workspace sheet/hub | Stay |
| R5 | Pulse Loads | Open `/pulse-loads` | Stay Org |
| R6 | Driver | Login Driver; open control/wallet | Driver chrome only |
| R7 | Public profile | Anon open share link | Readable; no sign-in |
| R8 | Marketing | `/terminal-website` | CTA works |
| R9 | Onboarding | Branding path completes or cancel clear | After clear, org routes work |
| R10 | Suite | Suite sign-in with product/returnTo (if used) | Lands suite product or Core correctly |

**Evidence:** Pass/Fail · Screenshot · Console only on fail

---

## 8. Failure scenarios

| ID | Fault | How | Expected |
|----|-------|-----|----------|
| F1 | Offline | DevTools offline; open `/trips` | Splash / offline hint; **not** endless wrong shell; restore when online |
| F2 | Slow 3G | Throttle; hard refresh `/finance` | Wait (`restoring`) then correct decision; no false anon sign-in if session valid |
| F3 | Supabase down | Block API host / 5xx | Error/retry UI; no redirect storm |
| F4 | Expired JWT | Force expire | Sign-in (+ returnTo if mid-route) |
| F5 | Missing profile | Eng fixture if available | Verify/splash until fail; no driver+org thrash |
| F6 | Corrupt local storage | Clear site data mid-session | Recover to anon or re-login; no uncaught exception loop |

**Evidence:** Pass/Fail · Console · Network · Screenshot

---

## 9. Evidence collection matrix

| Section | Pass/Fail | Screenshot | Console | Network | Video |
|---------|-----------|------------|---------|---------|-------|
| 1 Auth | Required | Required key steps | Required | On fail | A10, A3 |
| 2 Deep links | Required each row | Anon vs signed | On fail | On fail | D20–D21 |
| 3 Netlify | Required | N1–N3 | Required | N1 | N1, N2 |
| 4 Native | Required per OS | Per major | Device log on fail | Optional | M1, M7 |
| 5 OAuth | Required | Per flow | Required | Required O1/O4 | O1, O4 |
| 6 Multi-tab | Required | Both tabs | Both | Optional | T1 |
| 7 Regression | Required | Optional | On fail | On fail | Optional |
| 8 Failures | Required | Required | Required | Required | Optional |

**Artifact naming:** `{section}-{id}-{persona}-{result}.png`  
**Fail packet:** screenshot + console export + final URL + 10s video if navigation loop suspected.

---

## 10. Production exit criteria

Promote staging → production **only if all** are true:

| # | Criterion |
|---|-----------|
| 1 | **100%** of §1–§8 cases marked Pass, or Fail waived in writing by Eng lead with risk accepted |
| 2 | **0** redirect loops (Actor or layout) lasting >2 replaces of same target |
| 3 | **0** sustained wrong-shell flashes for Org vs Driver after splash ends |
| 4 | Anon deep link → login → **returnTo** succeeds for `/finance` and `/workspace` |
| 5 | `/auth/callback` and `/auth/reset-password` never lose mid-flow to org tabs |
| 6 | `/public-profile/…` and `/terminal-website` never force sign-in for anon |
| 7 | Driver hitting `/trips` / `/workspace` always ends on driver home (unless onboarding predicate) |
| 8 | Org hitting `/(driver)` ends on `/trips` |
| 9 | Console: no recurring NavigationPolicy / router exceptions on happy paths |
| 10 | CI: `navigation-policy` job green on the release commit |
| 11 | Kill switch documented in runbook; default remains **enforce on** |
| 12 | Netlify N1–N3 Pass on release candidate URL |

**Stop-ship (any one):** redirect loop; OAuth/reset broken; anon can mount org tabs shell without bounce; driver stuck on org splash with no redirect; returnTo open-redirect to external host.

---

## Sign-off

| Role | Name | Date | Build / commit | Result |
|------|------|------|----------------|--------|
| QA | | | | Pass / Fail |
| Eng (nav policy) | | | | Pass / Fail |
| Release | | | | **Staging OK / Hold** |

**Promotion:** After staging sign-off + exit criteria → **READY FOR PRODUCTION**.
