# Driver UI/UX: Current (Phase1) vs Team Gowtham

Comparison based on `git diff HEAD team/gowtham` for driver app routes.  
**Remotes:** `team` = `https://github.com/deepak-0659/pulse.git`, branch `gowtham`.

---

## 1. Dashboard (Radar) — `app/(driver)/index.tsx`

| Aspect | Current (yours) | Team Gowtham |
|--------|------------------|--------------|
| **Active mission** | Uses `isActiveMission(t.status)` only | Uses `isTripInProgress(t)` so trips with `started_at` set stay “active” even if status is ambiguous; completed statuses (`completed`, `delivered`, `done`) are excluded |
| **Offline + assigned trip** | Offline card: “You are currently offline” / “Go online” | If there’s an assigned trip waiting: icon changes to `map-marker`, title “Assigned trip waiting”, subtitle shows trip number + “Go online to view and accept.”, button “Go online to accept”; on tap runs `fetch()` after going online |
| **UX** | Single offline message | Clear nudge when a trip is waiting: driver sees which trip and is prompted to go online to accept |

**Summary:** Gowtham adds “assigned trip waiting” state on the offline card and tighter “in progress” vs “completed” logic.

---

## 2. Requests — `app/(driver)/requests.tsx`

| Aspect | Current (yours) | Team Gowtham |
|--------|------------------|--------------|
| **Scope** | **Invites + trip assignments** in one screen. Fetches driver invites and trips; shows “Organisation invites” and “Incoming trip assignments”; driver can Accept/Decline trips here and is taken to Control on accept | **Connection flow only** (driver_invites). No trip assignments on this screen. Subtitle: “Connection invites”. Trip accept/decline lives only on Dashboard → Control |
| **Copy** | “Invites & trip assignments”; section “Organisation invites” | “Connection invites”; section “PENDING” |
| **Invite cards** | Header: icon + org name; optional one-line offer (payable, commission %) | **Clean cards:** icon in rounded wrap, org name + **offer line** from `buildOfferText(inv)`: ₹payable · X% commission · ₹Y/km (or “Offer on accept”). No IDs/timestamps |
| **Trip list** | Incoming trips with Accept/Decline; decline hides trip (declinedTripIds) | No trip list; no trip accept/decline on this page |
| **Resolved invites** | — | Section for resolved (non-pending) invites |

**Summary:** Gowtham separates concerns: **Requests = org connection invites only.** Trip assignments are only on Dashboard/Control. Invite cards are cleaner (offer line with ₹/km, “Offer on accept” fallback).

---

## 3. Profile — `app/(driver)/profile.tsx`

| Aspect | Current (yours) | Team Gowtham |
|--------|------------------|--------------|
| **Imports** | Same deps, different order | Same |
| **Profile block** | `profileBlock` wrapper; `profileCard` with padding | Wrapper uses `card` style (border, radius, padding, margin). `profileCard` gets border radius 40, shadow (shadowOffset, shadowOpacity, shadowRadius), elevation 4 |
| **Visual** | Flatter card | Card has rounded corners and subtle shadow for depth |

**Summary:** Gowtham gives the profile card a more “card-like” look (radius + shadow).

---

## 4. Control — `app/(driver)/control.tsx`

Only formatting/import order differences (indentation, import grouping). No functional or UX change.

---

## 5. Trips — `app/(driver)/trips.tsx`

Minor diff (e.g. one line). No major UX difference.

---

## Summary table

| Screen | Current | Team Gowtham |
|--------|--------|--------------|
| **Dashboard** | Generic offline message | Offline card shows “Assigned trip waiting” + trip number when applicable; “Go online to accept”; better active/completed trip logic |
| **Requests** | Invites + trip assignments; accept/decline trips here | Invites only; cleaner invite cards (offer: ₹, %, ₹/km); trip actions only on Dashboard/Control |
| **Profile** | Standard card | Card with radius + shadow |
| **Control / Trips** | — | No meaningful UX delta |

---

## How to apply team Gowtham’s driver changes

- **Merge branch:**  
  `git fetch team gowtham && git merge team/gowtham`  
  (resolve conflicts if any in `app/(driver)/`.)

- **Cherry-pick only driver UX:**  
  Apply the diffs for `app/(driver)/index.tsx`, `requests.tsx`, and `profile.tsx` from `team/gowtham` (offline + assigned state, requests = invites only + offer text, profile card styling).

- **Reference:**  
  `git show team/gowtham:app/\(driver\)/index.tsx`  
  `git show team/gowtham:app/\(driver\)/requests.tsx`  
  `git show team/gowtham:app/\(driver\)/profile.tsx`
