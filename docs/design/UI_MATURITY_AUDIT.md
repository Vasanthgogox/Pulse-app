# Pulse — UI / UX Maturity Audit

**Phase:** Product surface maturity  
**Status:** Audit complete + design system foundation (`/design-system`)  
**Principle:** Every screen answers — *“What is the ONE operational action the user cares about right now?”*

---

## Executive summary

Pulse has **strong domain depth** (trips, ledger, network, drivers) but **weak surface cohesion**. The app reads as a **feature-rich React Native product** assembled over time—not yet a **premium operational OS**.

| Signal | Assessment |
|--------|------------|
| Color tokens | `Theme.ts` exists (~480 lines) but **300+ files** import it with local overrides |
| Typography | `Typography.ts` is **header-only**; sizes 7–15px; finance uses separate `FinanceTxnTypography` |
| Spacing | `Layout.ts` partial scale; **thousands** of ad-hoc paddings in features |
| Cards / borders | **High** border usage; finance ledger especially border-heavy |
| Modals | **47+ modal/sheet files** — default pattern for complex flows |
| Loading | Mix of `ActivityIndicator`, `PulseLoader`, skeletons — inconsistent |
| Empty states | **Inconsistent** — some guided (salary-request), many generic |
| Tabular money | **~20 files** use tabular nums; most ₹ amounts do not |
| Headers | **9+ header variants** (`TeslaHeader`, `DriverHeader`, `HomePageHeader`, per-screen) |

**Target feel:** Stripe Dashboard × Uber Fleet × Linear (calm, dense when needed, sparse when onboarding).  
**Current feel:** Admin panel + mobile wrapper + form wizard stack.

---

## Audit matrix (20 areas)

| # | Area | Severity | Finding |
|---|------|----------|---------|
| 1 | Spacing | **High** | `Layout` defines 6/8/14/18/24 but codebase uses 10, 11, 13, 15, 22, 26, 28… `signUpMobileTokens` duplicates scale |
| 2 | Typography | **High** | No global type ramp; `Typography.headerSubtitle` is **7px**; uppercase micro-labels everywhere |
| 3 | Border overuse | **High** | `borderWidth: 1` in 100+ files; `SharedLedgerCommandCenter` extreme; cards nested in cards |
| 4 | Visual hierarchy | **High** | Primary actions compete with filters, FABs, header icons, and secondary pills equally |
| 5 | Excessive cards | **High** | Summary cards, hub bento, network glass cards, entity hero dual cards — surface stacking |
| 6 | Modal chaos | **High** | Add trip, add txn, add client, bids, invites — modals instead of routes |
| 7 | Responsive | **Medium** | `webDesktopMinWidth: 900` vs signup `1024`; stretched mobile on desktop web |
| 8 | Buttons | **Medium** | Indigo pills, emerald driver, slate chips, google buttons — no single `Button` primitive |
| 9 | Headers | **High** | `TeslaHeader` 40+ optional props; dark/light; icon cluster overload |
| 10 | Overloaded screens | **High** | Trips hub, Network, Finance ledger, Driver dashboard — too many zones per viewport |
| 11 | Empty states | **Medium** | Ledger good copy; garage `paddingVertical: 24`; many “no data” patterns |
| 12 | Loading states | **Medium** | Full-screen spinners; layout jump on fetch; partial skeleton use |
| 13 | Visual noise | **High** | Badges, pills, dots, zone colors, glass effects, gradients concurrently |
| 14 | Alignment rhythm | **Medium** | 16px vs 20px vs 24px horizontal padding across tabs |
| 15 | Operational focus | **High** | Screens show *everything* (filters + KPIs + list + FAB + toast) not *next action* |
| 16 | Touch ergonomics | **Medium** | `minTouchTargetSize: 44` documented; dense chips below 44pt in filters |
| 17 | Generic interactions | **Medium** | Default sheets, alert dialogs, stock `TouchableOpacity` opacity |
| 18 | Animations | **Low–Med** | Moti on signup/trips; inconsistent elsewhere; some heavy springs |
| 19 | Density management | **High** | Onboarding sparse, ledger ultra-dense, no tier system in code |
| 20 | Information grouping | **Medium** | Related fields split across cards/modals; weak section semantics |

---

## 1. Spacing inconsistencies

**Evidence**

- `constants/Layout.ts`: `screenPaddingHorizontal: 16`, `sectionSpacing: 24`, but also `spacingSmall: 6`, `spacingMedium: 8` (non-scale numbers).
- `features/auth/signup/signUpMobileTokens.ts` — parallel spacing system (20px padH).
- `features/finance/components/FinanceScreen.styles.ts` — local spacing grid.
- `entityHero` block in Layout — 26px, 28px, 34px radii padding (one-off).

**Impact:** Screens feel “almost aligned” but never quite—uncanny valley of polish.

**Fix:** Adopt `/design-system/spacing.ts` only (`4–64` scale). ESLint rule: warn on padding/margin not in scale (future).

---

## 2. Typography inconsistencies

**Evidence**

- `constants/Typography.ts` — 5 header tokens only; smallest **7px** subtitle.
- `constants/FinanceTxnTypography.ts` — separate 8–12px ledger micro type.
- Trip cards, network load cards — local `fontSize: 15`, `fontWeight: '900'`, italic uppercase cities.
- Signup mobile — 20px titles vs desktop page titles 24–40px.

**Impact:** Weak hierarchy; operational metrics don’t “snap” for finance users.

**Fix:** `/design-system/typography.ts` — display → label + **mandatory `tabularNums` on all INR**.

---

## 3. Border overuse

**Evidence**

- Cards default: `borderWidth: 1.5` in signup, forms, modals.
- Lists: row separators + card border + section border (triple framing).
- `CityPicker`, chips, filters — bordered everything.

**Impact:** Amateur “boxed UI”; eye tired on ledger/trips.

**Fix:** **Surface system** — `elevation(0|1|2)` + `surface` background steps; borders only for inputs and errors.

---

## 4. Weak visual hierarchy

**Evidence**

- Trips hub: metrics bento + filters + list + FAB + chat FAB.
- Finance: treasury banner + category chips + table header + row actions.
- Headers: 4–5 icons same visual weight as title.

**Fix:** **One dominant action** per route (documented in screen briefs). Demote filters to icon or single “Refine” entry.

---

## 5. Excessive card usage

**Evidence**

- `SummaryCard`, hub bento metrics, `NetworkConnectionHubCards`, entity hero **dual card** (70/30).
- Trip `TripExpandableCard`, load cards, glass badges.

**Fix:** **Card reduction strategy** (§9) — convert 60% of cards to flat lists with spacing.

---

## 6. Modal chaos

**Evidence (sample)**

| Modal | Concern |
|-------|---------|
| `AddTransactionModal` | Large form in modal — should be route/sheet |
| `AddTripModal` | Full wizard in modal |
| `AddClientModal` / `AddDriverModal` | Duplicate patterns |
| `BidModal`, `AwardModal` | Network flows fragmented |
| `SharedLedgerModal` | Finance complexity in overlay |

**47 modal files** vs dedicated routes (`/add-trip`, `/create-indent` exist but modals persist).

**Fix:** **Modal reduction** — modals only for confirm/delete/<3 fields; flows → fullscreen routes.

---

## 7. Poor responsive behavior

**Evidence**

- Breakpoints: 900 (layout), 1024 (signup), entity hero desktop-only columns.
- Desktop web: fixed `desktopTopNavOffset: 84` but content still mobile-width centered.
- Tablet: tab bar + FAB overlap reported in dense screens.

**Fix:** `design-system/layout.ts` + responsive primitives (`Stack`, `Split`, `Rail`).

---

## 8. Inconsistent button styles

**Evidence**

- Primary: `Theme.primary`, `Theme.actionAccent`, `Theme.driverEmerald`, signup accent.
- Secondary: bordered white, slate chips, text links.
- No shared `Button` with `variant: primary | secondary | ghost | danger`.

**Fix:** `components/ui/Button.tsx` (Phase 2) mapping to semantic colors.

---

## 9. Header system

**Current variants**

| Component | Use |
|-----------|-----|
| `TeslaHeader` | Dispatcher dark/light |
| `DriverHeader` / `DriverSubScreenHeader` | Driver stack |
| `HomePageHeader` | Tab home |
| `ListScreenLayout` | Inline title + search |
| `DetailPageLayout` | Back + title |
| Per-screen custom | Finance, Network, Trips |

**Fix:** Three shells only:

1. **OperationalHeader** (mobile) — title, one action, back  
2. **WorkspaceHeader** (desktop) — context + breadcrumbs  
3. **SectionHeader** (in-scroll) — sticky optional  

---

## 10. Overloaded screens (priority fixes)

| Screen | Primary action (should be) | Current noise |
|--------|---------------------------|---------------|
| Trips hub | Assign / open active trip | Bento, filters, dual FABs |
| Finance ledger | Record payment / reconcile | Treasury + chips + wide table |
| Network | Act on best load | Stories, tabs, glass, modals |
| Driver dashboard | Start / complete trip | Level XP, multiple cards |
| Trip detail | Update status | Too many sections expanded |

---

## 11. Empty states

**Good:** `LedgerTransactionListView` — title + subtext + action path.  
**Weak:** `GarrageTab` — centered padding only.  
**Missing:** Team invites, onboarding resume, filtered lists with zero results.

**Template (required):**

1. What happened (plain language)  
2. Why it matters operationally  
3. Primary CTA  
4. Optional secondary link  

---

## 12. Loading states

**Patterns found**

- `CenteredLoadingView`, `PulseLoader`, `ActivityIndicator`, `LazySuspenseFallback`
- Some analytics tabs: custom skeletons
- Lists: often blank → pop-in

**Fix:** Route-level skeleton matching final layout; optimistic list updates for trips/ledger.

---

## 13. Visual noise

Sources: zone pills (N/S/E/W colors), status badges, unread dots, `GlobalOperationsToast`, alert registry, AI badges, glass blur on network.

**Fix:** **Semantic color only for status**; neutrals for chrome; one accent (indigo) for brand.

---

## 14. Alignment rhythm

Standardize:

- Screen gutter: **16px** mobile, **24px** tablet+  
- Section gap: **24px**  
- List row: **12px** vertical, **16px** horizontal  

Audit tool: script counting unique padding values per feature folder (future).

---

## 15. Operational focus

**Product rule:** Dispatcher on phone at yard — thumb zone, one action, minimal typing.

**Gaps**

- Too many text fields on one screen (company signup, add trip modal).
- Filters always visible vs behind “Refine”.
- Secondary metrics above fold on hub screens.

---

## 16. Touch ergonomics

- Documented 44pt in `Layout` — not enforced in chip rows / filter tabs (8px labels).
- FAB stack (chat + action) — collision risk.
- Bottom tab bar + FAB — thumb reach OK but crowded.

**Fix:** Bottom **action bar** pattern for primary commit on forms; chips min height 44.

---

## 17. Generic interactions

- Stock opacity on press.
- `Alert.alert` for errors in signup (breaks immersion).
- Sheets without drag handle consistency.

**Fix:** Haptic on commit (native), inline field errors, themed confirm via `ThemedConfirmModal` only.

---

## 18. Animations

- Moti on signup, add trip steps — good direction.
- No shared `motion.ts` until now.
- Risk: bouncy springs on operational confirms.

**Fix:** `/design-system/motion.ts` — timing only, 200–280ms, ease-out.

---

## 19. Density management

| Tier | Screens | Current | Target |
|------|---------|---------|--------|
| LOW | Onboarding, success, verify | Mixed | Generous whitespace, large type |
| MEDIUM | Trip detail, profiles | Heavy cards | Flat sections, clear titles |
| HIGH | Ledger, dispatch lists, ops console | Cramped + bordered | Tight rows, no card per row |

**Code:** `design-system/density.ts` — apply per screen via hook `useDensity('high')`.

---

## 20. Information grouping

- Trip detail: finance + map + docs + assignment — correct domains, weak **progressive disclosure**.
- Entity pages: hero + tabs + inline edit — good structure, heavy chrome.

**Fix:** Accordion sections default collapsed except **one** expanded (the operational task).

---

## Design system architecture

```
/design-system/
  index.ts          # public API
  spacing.ts        # 4–64 scale
  typography.ts     # display → label + tabular metrics
  radius.ts         # sm → 2xl
  elevation.ts      # 0–3 surfaces (replaces border cards)
  colors.ts         # semantic operational colors → Theme
  motion.ts         # durations
  layout.ts         # gutters, max widths, breakpoints
  density.ts        # low | medium | high

/constants/Theme.ts # legacy — map into colors.ts over time
/constants/Layout.ts # migrate into layout.ts + spacing.ts
```

**Import rule for new code:** `import { space, typography, colors } from '@/design-system'`

---

## Card reduction strategy

1. **List rows** — Remove outer card; use `paddingVertical: space[3]` + hairline separator OR spacing only.  
2. **Hub metrics** — Single horizontal **metric strip** (3 numbers max), not bento grid.  
3. **Entity hero** — One gradient financial block; profile inline row, not second card.  
4. **Forms** — Field groups separated by `space[6]`, not bordered boxes.  
5. **Filters** — One row: search + “Refine” sheet.

**Target:** −40% bordered containers on trips + finance in Phase 2.

---

## Operational list redesign

**Ledger / trips list row anatomy**

```
[Status dot]  Primary label (trip id / party)     ₹ amount (tabular, right)
              Secondary (route / date)            Status chip (muted)
```

- Amount always right-aligned, tabular, semibold.  
- Status: semantic color dot — not filled pill unless critical.  
- Swipe or overflow menu for secondary actions — not 3 inline buttons.

**Mobile compression:** Collapse secondary line; keep amount + status.

---

## Component consolidation map

| Duplicate today | Consolidate to |
|-----------------|----------------|
| Primary buttons (5+ styles) | `Button` |
| Headers (9+) | `OperationalHeader`, `SectionHeader` |
| Empty states (ad-hoc) | `OperationalEmptyState` |
| Loading (3 patterns) | `ScreenSkeleton` + `ListRowSkeleton` |
| Search rows | `ListToolbar` (search + refine) |
| Confirm dialogs | `ThemedConfirmModal` only |
| Numeric entry | `SmartInput` / keypad (already started) |
| Cards | `Surface` + `ListRow` |

---

## Responsive system (target)

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | <600 | Single column, bottom actions |
| Tablet | 600–900 | Optional two-column detail |
| Desktop | ≥900 | Sidebar / rail + main; not centered mobile column |

**Primitive:** `ResponsiveSplit` — main + optional rail (live ops already has shelf pattern).

---

## Empty / loading redesign

### Empty state component

```tsx
<OperationalEmptyState
  icon="truck"
  title="No active trips"
  description="When you assign a driver, trips appear here for live tracking."
  action={{ label: 'Create trip', onPress }}
/>
```

### Loading

- Route skeleton first paint (match header + 6 list rows).  
- No full-screen spinner except auth boot (`AppLoadingSplash` OK).

---

## Rollout strategy

| Wave | Scope | Risk |
|------|-------|------|
| **W0** | Design tokens + docs (this audit) | None |
| **W1** | Signup + onboarding (`design-system`) | Low |
| **W2** | Shared primitives: Button, Surface, ListRow, Empty | Medium |
| **W3** | Trips hub + trip list rows | High visibility |
| **W4** | Finance ledger (highest border debt) | High |
| **W5** | Network / modals → routes | High |
| **W6** | Driver app density pass | Medium |

**Rule:** New PRs touching a screen must use design-system tokens if editing styles.

---

## Performance impact analysis

| Change | Impact |
|--------|--------|
| Fewer nested views / borders | **↓ layout cost** |
| FlatList instead of ScrollView+map | Already good on hubs — keep |
| Skeleton vs spinner | **↓ perceived latency** |
| Modal → route | **↓ remount cost**, better memory |
| Themed shadows vs borders | Neutral GPU |
| tabular-nums | Negligible |

**Risk:** Big-bang restyle causes churn — prefer wave rollout per tab.

---

## Before / after (visual targets)

Screenshots are not captured in-repo; use these **acceptance checks** when reviewing PRs:

| Check | Before (fail) | After (pass) |
|-------|---------------|--------------|
| Primary action | 3+ same-size buttons | 1 filled primary, rest ghost |
| Money | Mixed fonts, left aligned | Tabular, right aligned |
| List | Card per row with border | Flat row + spacing |
| Screen padding | 10–20 mixed | 16 or 24 only |
| Header | 5 icons + title | Title + max 2 actions |
| Empty | “No data” | Guided CTA |
| Modal | Wizard in sheet | Full route |

---

## Critical product rule (repeat)

Pulse is an **operational execution system**, not a dashboard.

Optimize for:

- Rapid operations under stress  
- Financial confidence (readable money)  
- Low cognitive load  
- Repetitive thumb workflows  
- Clear status at a glance  

---

## Next implementation steps

1. **`components/ui/`** — `Button`, `Surface`, `OperationalHeader`, `ListRow`, `OperationalEmptyState`  
2. **Pilot screen:** Trips list row + toolbar (high traffic)  
3. **Finance ledger** — border removal pass on `LedgerTransactionListView`  
4. **ESLint** — discourage raw hex and off-scale spacing in `features/`  
5. **Figma / reference board** — Stripe + Linear spacing references linked in PR template  

---

## Related docs

- [`docs/architecture/ONBOARDING_SYSTEM_AUDIT.md`](../architecture/ONBOARDING_SYSTEM_AUDIT.md) — flow architecture (complementary)  
- [`/design-system/index.ts`](../../design-system/index.ts) — token entry point  
- [`constants/Theme.ts`](../../constants/Theme.ts) — legacy color source  
- [`docs/RESPONSIVE_AND_SAFE_AREA.md`](../RESPONSIVE_AND_SAFE_AREA.md) — safe area (keep; align gutters with `space[4]`)

---

*Audit generated from codebase scan (Theme, Layout, Typography, modals glob, border/loading/empty grep). Update this doc when Wave 1 ships.*
