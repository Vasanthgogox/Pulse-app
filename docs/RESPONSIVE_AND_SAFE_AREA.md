# Responsive Design & Safe Area Compliance

This document defines how Pulse stays consistent and safe-area compliant across all device types and orientations. Follow it for app store approval and a professional UX.

## 1. Safe area (required on every screen)

### What to account for

| Platform   | Elements to respect |
|-----------|----------------------|
| **iOS**   | Status bar, notch, Dynamic Island (iPhone 14+), home indicator |
| **Android** | Status bar, notch/punch hole, system navigation bar (gesture or 3-button) |
| **Tablets** | Status bar, system UI; test portrait and landscape |

Never assume a fixed status bar height or home indicator height. Always use `react-native-safe-area-context`.

### Implementation

- **Root:** `SafeAreaProvider` wraps the app in `app/_layout.tsx`. Do not remove it.
- **Screens:** Use `useSafeAreaInsets()` and apply:
  - **Top:** `paddingTop: insets.top` (or `insets.top + 16` for headers with content below).
  - **Bottom:** `paddingBottom: insets.bottom` on scroll content and fixed bottom UI so content is not obscured by the home indicator.
- **Loading / full-screen views:** Use `CenteredLoadingView` from `@/components/CenteredLoadingView` so spinner and message respect insets.
- **List screens:** Use `ListScreenLayout` — it already applies top inset on the header and bottom inset on the scroll content.
- **Detail screens:** Use `DetailPageLayout` — it already applies top and bottom insets.
- **Custom headers:** If you use a custom header (e.g. TeslaHeader), either use a header that applies `paddingTop: insets.top + 16` (like `@/components/TeslaHeader`) or wrap the screen in a `View` with `paddingTop: insets.top` and add header padding yourself.
- **FABs / fixed bottom UI:** Position with `bottom: 24 + insets.bottom` (or use `Layout.fabBottomOffset + insets.bottom` from `@/constants/Layout`).

### Checklist for new screens

- [ ] Root container or header has `paddingTop: insets.top` (or uses a layout that does).
- [ ] Scroll content has `paddingBottom` that includes `insets.bottom` so the last item is not hidden.
- [ ] Any fixed bottom element (FAB, tab bar, input bar) uses `insets.bottom`.
- [ ] Loading state uses `CenteredLoadingView` or applies insets manually.
- [ ] Modals use `paddingTop: insets.top` and `paddingBottom: insets.bottom` (or a modal layout that does).

---

## 2. Screen sizes and breakpoints

### Device categories to support

| Category        | Examples                          | Focus |
|----------------|------------------------------------|-------|
| Compact phones | iPhone SE, Pixel 6a                 | No clipping; readable text; touch targets |
| Standard phones| iPhone 15, Pixel 8                 | Primary target |
| Large phones   | iPhone 15 Pro Max, Pixel 8 Pro    | No excessive whitespace; content uses width |
| Tablets        | iPad, iPad Pro, Android tablets    | Portrait + landscape; optional max content width |

### Do not

- Use `Dimensions.get('window')` for one-off layout decisions unless necessary (e.g. orientation). Prefer flex and percentage where possible.
- Hardcode pixel widths for screens (e.g. `width: 375`). Use `flex: 1`, `width: '100%'`, or percentage.
- Assume a single aspect ratio.

### Do

- Use **flex** and **percentage** for layout so content adapts.
- Use `minWidth: 0` on flex children that contain text so they can shrink and not overflow.
- For very wide content (e.g. tablets), consider `maxWidth` (e.g. `maxWidth: 600`) on inner content so lines don’t become too long.
- Use `Layout.screenPaddingHorizontal` and `Layout.sectionSpacing` from `@/constants/Layout` for consistency.

---

## 3. Touch targets and readability

- **Minimum touch target:** 44×44 pt (Apple HIG) / ~48 dp (Android). Buttons and tappable icons should meet this; use `hitSlop` or padding if the visible shape is smaller.
- **Text:** Use Theme for colors. Avoid font sizes below 11–12 for body text. Support Dynamic Type / font scaling where applicable.
- **Spacing:** Prefer constants from `Layout` or Theme so spacing is consistent and easy to tune.

---

## 4. Orientation and edge cases

- **Tablets:** Test portrait and landscape. Ensure headers and key actions remain accessible.
- **Foldables:** Layout should not break when the window size changes; flex-based layouts handle this.
- **Rounded corners / cutouts:** Safe area insets from the OS already account for these; use insets and avoid fixed margins in the corners.

---

## 5. Shared components and files

| Item | Purpose |
|------|--------|
| `SafeAreaProvider` | `app/_layout.tsx` — wraps entire app |
| `useSafeAreaInsets()` | From `react-native-safe-area-context` — use in every screen that draws to edges |
| `CenteredLoadingView` | `@/components/CenteredLoadingView` — safe-area-aware loading state |
| `ListScreenLayout` | `@/components/ListScreenLayout` — list screens with header + bottom inset |
| `DetailPageLayout` | `@/components/DetailPageLayout` — detail screens with back + insets |
| `FAB` | `@/components/FAB` — FAB with `bottom: 24 + insets.bottom` |
| `Layout` | `@/constants/Layout` — spacing and layout constants |
| `.cursor/rules/pulse-responsive.mdc` | Cursor rule for ongoing compliance |

---

## 6. Testing recommendations

Test on at least:

- **Compact:** iPhone SE (2nd/3rd) or small Android.
- **Standard:** iPhone 15 or Pixel 8.
- **Large:** iPhone 15 Pro Max or Pixel 8 Pro.
- **Tablet:** iPad or Android tablet (portrait + landscape).

Verify for each:

1. Status bar / notch content is not clipped.
2. Bottom content and FABs clear the home indicator.
3. No overlapping or clipped buttons or text.
4. Lists and scroll views have enough bottom padding.
5. Modals and sheets respect top and bottom safe areas.

Running the app in the Expo Go app on multiple devices is sufficient for a first pass; add simulator/emulator or device farm runs as needed for release.
