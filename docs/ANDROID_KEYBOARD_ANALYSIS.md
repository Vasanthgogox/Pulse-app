# Android Keyboard Analysis & Global Fix

**Date:** 2025-03-10  
**Scope:** Full codebase — modals, forms, bottom sheets, ScrollViews, TextInputs.  
**Goal:** Diagnose why the keyboard hides modals/inputs on Android physical devices and implement a **global** architecture fix.

---

## A. Root Causes Discovered in the Codebase

### 1. **KeyboardAvoidingView with `behavior={undefined}` on Android**

Most modal and form screens use:

```tsx
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
```

On Android, `undefined` means **no behavior** — KeyboardAvoidingView does nothing. The window may resize (see config below), but **React Native `Modal` renders in a separate window** on Android; the main window’s resize does not apply to Modal content, so modal forms are not shifted.

**Affected:** AddClientModal, AddSupplierModal, AddDriverModal, AddVehicleModal, EditClientModal, EditSupplierModal, EditProfileModal, sign-in, driver-signup, claim-trip, salary-request, AddTripModalLayout, (driver)/profile quote modal.

### 2. **Modals with forms but no KeyboardAvoidingView**

- **DisputeAuditSheet** — `Modal` → `View` → `ScrollView` + `TextInput` (reason, proposed amount). No KAV; inputs can be covered by keyboard.
- **TreasurySummaryCard** — Filter dropdown is a `Modal` with no inputs (touch-only); low risk but modal uses fixed `top` positioning.

### 3. **Full-screen form screens without KeyboardAvoidingView**

- **create-indent** — ScrollView + many TextInputs, no KAV. Relies only on `softwareKeyboardLayoutMode: 'resize'`; on some devices or when used inside a stacked layout, bottom inputs can still be covered.
- **app/(tabs)/profile** — ScrollView with form fields; no KAV.
- **DetailPageLayout** — Shared layout used by detail screens; ScrollView has no `keyboardShouldPersistTaps` and no KAV. Any screen that puts TextInput inside (e.g. search) can have tap/scroll issues.

### 4. **ScrollViews without `keyboardShouldPersistTaps="handled"`**

Taps on non-input elements (e.g. buttons, list items) can dismiss the keyboard before firing when the ScrollView doesn’t persist taps. Screens with ScrollView + TextInput but missing this prop:

- **TreasuryDetailLayout** — ScrollView, no `keyboardShouldPersistTaps`.
- **DetailPageLayout** — ScrollView, no `keyboardShouldPersistTaps`.
- **TripAssignmentBlock** — Two ScrollViews in modals without it.
- **EntityDetailOverlay** — Multiple ScrollViews; not all set.
- **app/(driver)/settings**, **network**, **requests** — ScrollView without.
- **app/(tabs)/profile** — ScrollView without.
- **FinanceScreen** (table scroll), **EntityCompareVerifyView** (table scroll), **SharedLedgerContent** — ScrollViews without (some are tables only; add if they ever contain focusable inputs).
- **AddDriverModal** — Inner “review” ScrollView (line ~546) has no `keyboardShouldPersistTaps`.

### 5. **Fixed / absolute positioning with inputs**

- **TreasurySummaryCard** — Filter modal uses `position: 'absolute'` and dynamic `top: dropdownAnchorY`. Not keyboard-aware.
- **DisputeAuditSheet** — `closeBtn` uses `position: 'absolute'`; layout is otherwise flex.
- **ClientSearchField** — Dropdown with `position: 'absolute'`; contains inputs.
- **OpsAgentMessageRow** — Inline “modal” forms with many TextInputs inside a ScrollView; OpsAgentScreen uses `marginBottom: keyboardHeight` for the whole chat, which is correct only if the input bar is at the bottom.

### 6. **Expo Router modal presentation**

- `(modals)` stack uses `presentation: 'modal'` (and some `fullScreenModal`). These are native modals; keyboard behavior depends on native stack + our KAV/scroll usage inside each screen, not on a single global wrapper.

### 7. **Inconsistent Android behavior choice**

- Only **AddVehicleEntryModal** and **AddTransactionModal** use `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` on Android. The rest use `undefined`, so only iOS gets avoidance.

---

## B. Screens/Components Affected (by severity)

### Critical (inputs hidden or unusable on Android)

| Location | Issue |
|---------|--------|
| **DisputeAuditSheet** | Modal with ScrollView + TextInput; no KAV. |
| **AddClientModal** | KAV with `behavior={undefined}` on Android. |
| **AddSupplierModal** | Same. |
| **AddDriverModal** | Same. |
| **AddVehicleModal** | Same. |
| **EditClientModal** | Same. |
| **EditSupplierModal** | Same. |
| **AddTransactionModal** | Uses `height` on Android — OK. |
| **AddVehicleEntryModal** | Uses `height` on Android — OK. |
| **driver-signup** | KAV with `behavior={undefined}` on Android; multi-step form. |
| **sign-in** | KAV with `behavior={undefined}` on Android. |
| **sign-up** | Uses `padding` on both; has manual `keyboardHeight` padding — better. |
| **app/(driver)/profile** (quote modal) | KAV with `behavior={undefined}` on Android. |
| **EditProfileModal** | KAV with `behavior={undefined}` on Android. |
| **AddTripModalLayout** | KAV with `behavior={undefined}` on Android. |
| **app/(driver)/claim-trip** | KAV with `behavior={undefined}` on Android. |
| **app/(driver)/salary-request** | KAV with `behavior={undefined}` on Android. |

### Layout shift / scroll blocked

| Location | Issue |
|---------|--------|
| **create-indent** | No KAV; long form; bottom fields can be covered. |
| **app/(tabs)/profile** | ScrollView without KAV; no `keyboardShouldPersistTaps` on ScrollView. |
| **DetailPageLayout** | No `keyboardShouldPersistTaps`; used by detail screens with search. |
| **ListScreenLayout** | Has `keyboardShouldPersistTaps` on both FlatList and ScrollView — OK. |
| **DetailScreenLayout** | Has `keyboardShouldPersistTaps` — OK. |

### Lower risk (no or few inputs)

| Location | Issue |
|---------|--------|
| **TreasurySummaryCard** filter Modal | No inputs; fixed position. |
| **LedgerReportModal** | ScrollView; no form inputs in main content. |
| **EntityListCategoryModal** | ScrollView with `keyboardShouldPersistTaps`; no TextInput. |
| **OpsAgentScreen** | Uses `keyboardHeight` margin; input at bottom — generally OK. |

---

## C. Android-Specific Configuration Issues

### Already correct

- **app.config.js** — `expo.android.softwareKeyboardLayoutMode: 'resize'` is set. This maps to `android:windowSoftInputMode="adjustResize"` and resizes the main window when the keyboard opens. Good for non-Modal screens.
- **app.json** — No conflicting Android keyboard settings.

### Why it’s still broken in modals

- On Android, React Native’s `<Modal>` content is rendered in a **separate window**. `adjustResize` applies to the **activity’s main window**, not the modal window. So Modal content does not get resized when the keyboard opens; we must use **KeyboardAvoidingView with an explicit Android behavior** (e.g. `padding` or `height`) inside the Modal.

### Optional hardening

- **expo-build-properties**: Can explicitly set `android.windowSoftInputMode` if you need to override (e.g. `adjustResize`). Current Expo `softwareKeyboardLayoutMode: 'resize'` is sufficient for non-Modal screens; Modal fix is in-app (KAV).

---

## D. Global Architecture Solution

### 1. Reusable **KeyboardAwareLayout** component

- A single wrapper that:
  - Uses `KeyboardAvoidingView` with **Platform-appropriate behavior**: iOS `padding`, Android `padding` (or `height` for full-screen modals).
  - Wraps a `ScrollView` with `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="on-drag"`.
  - Accepts `keyboardVerticalOffset` (e.g. header height) and optional `contentContainerStyle` / `style`.
- Use for: full-screen forms (create-indent, profile), and as the inner content wrapper for modal forms.

### 2. **KeyboardAwareModal** (optional)

- Wrapper: `Modal` → `KeyboardAvoidingView` (Android: `padding` or `height`) → optional ScrollView (with `keyboardShouldPersistTaps="handled"`) → children.
- Use for: every RN `Modal` that contains forms (DisputeAuditSheet, AddClient, AddDriver, etc.). Either adopt this wrapper or keep existing Modal but add KAV + ScrollView with consistent props inside.

### 3. Standardize Android behavior

- **All** modals and form screens that use `KeyboardAvoidingView` should pass an explicit Android behavior:
  - `behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}`  
  - or `'height'` on Android for full-screen/maximized modals (like AddTransactionModal).
- Prefer a shared constant or helper so new screens don’t revert to `undefined`.

### 4. ScrollView rules

- Any `ScrollView` that can contain **TextInput** or tappable elements (buttons, list items) while the keyboard is open must have:
  - `keyboardShouldPersistTaps="handled"`
  - Optionally `keyboardDismissMode="on-drag"`.
- Apply in: DetailPageLayout, TreasuryDetailLayout, profile, create-indent (already has taps), and all modal ScrollViews.

### 5. Modal layout strategy

- **Pattern:** Modal → KeyboardAvoidingView (Android behavior set) → [header] → ScrollView (`keyboardShouldPersistTaps="handled"`) → form content.
- Avoid fixed-height modals that don’t shrink when the keyboard opens; use flex so KAV can reduce the content area.

---

## E. Refactoring Plan (File-Level)

### Phase 1 — Global components and config

| File | Action |
|------|--------|
| **components/KeyboardAwareLayout.tsx** | **Create.** KeyboardAvoidingView + ScrollView, optional offset, `keyboardShouldPersistTaps` and `keyboardDismissMode`. |
| **components/KeyboardAwareModal.tsx** | **Create.** Modal + KeyboardAvoidingView (Android `padding`) + optional scroll; use for new modals or refactor existing. |
| **constants/Keyboard.ts** or **lib/keyboard.ts** | **Create (optional).** Export `KEYBOARD_AVOIDING_BEHAVIOR` = `Platform.OS === 'ios' ? 'padding' : 'padding'` and default `keyboardVerticalOffset` for modals. |

### Phase 2 — Fix critical modals (no KAV or Android behavior)

| File | Action |
|------|--------|
| **features/finance/components/DisputeAuditSheet.tsx** | Wrap Modal content in `KeyboardAvoidingView` (Android: `padding`), keep ScrollView with `keyboardShouldPersistTaps="handled"`. |
| **features/clients/components/AddClientModal.tsx** | Set `behavior="padding"` on Android (or use shared constant). |
| **features/suppliers/components/AddSupplierModal.tsx** | Same. |
| **features/drivers/components/AddDriverModal.tsx** | Same. |
| **features/vehicles/components/AddVehicleModal.tsx** | Same. |
| **features/clients/components/EditClientModal.tsx** | Same. |
| **features/suppliers/components/EditSupplierModal.tsx** | Same. |
| **features/auth/components/EditProfileModal.tsx** | Same. |
| **app/driver-signup.tsx** | Set `behavior="padding"` on Android. |
| **app/sign-in.tsx** | Set `behavior="padding"` on Android. |
| **app/(driver)/profile.tsx** (quote modal) | Set `behavior="padding"` on Android. |
| **features/trips/components/add-trip/AddTripModalLayout.tsx** | Set `behavior="padding"` on Android. |
| **app/(driver)/claim-trip.tsx** | Set `behavior="padding"` on Android. |
| **app/(driver)/salary-request.tsx** | Set `behavior="padding"` on Android. |

### Phase 3 — ScrollView and layout consistency

| File | Action |
|------|--------|
| **components/DetailPageLayout.tsx** | Add `keyboardShouldPersistTaps="handled"` to ScrollView. |
| **features/finance/components/TreasuryDetailLayout.tsx** | Add `keyboardShouldPersistTaps="handled"` if the screen can show inputs. |
| **app/(tabs)/profile.tsx** | Add `keyboardShouldPersistTaps="handled"` to ScrollView; consider wrapping in KeyboardAwareLayout for form. |
| **app/create-indent.tsx** | Consider wrapping form in KeyboardAwareLayout for consistent behavior across devices. |
| **features/drivers/components/AddDriverModal.tsx** | Add `keyboardShouldPersistTaps="handled"` to the review-step ScrollView (line ~546). |
| **features/trips/components/TripAssignmentBlock.tsx** | Add `keyboardShouldPersistTaps="handled"` to modal ScrollViews. |

### Phase 4 — Optional migration to shared components

| File | Action |
|------|--------|
| New modal forms | Use `KeyboardAwareModal` or the same Modal + KAV + ScrollView pattern. |
| New full-screen forms | Use `KeyboardAwareLayout` as the main wrapper. |

---

## F. Code Examples for the Recommended Global Pattern

### 1. KeyboardAwareLayout (full-screen or modal body)

```tsx
// components/KeyboardAwareLayout.tsx
import { Platform, KeyboardAvoidingView, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

type Behavior = 'padding' | 'height' | 'position';

const defaultBehavior: Behavior = Platform.OS === 'ios' ? 'padding' : 'padding';

interface KeyboardAwareLayoutProps {
  children: ReactNode;
  keyboardVerticalOffset?: number;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  /** Set to false to render a plain View instead of ScrollView (e.g. when child is already a ScrollView). */
  scroll?: boolean;
}

export function KeyboardAwareLayout({
  children,
  keyboardVerticalOffset = 0,
  style,
  contentContainerStyle,
  scroll = true,
}: KeyboardAwareLayoutProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, style]}
      behavior={defaultBehavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
});
```

### 2. KeyboardAwareModal (Modal with form)

```tsx
// components/KeyboardAwareModal.tsx
import { Modal, Platform, KeyboardAvoidingView, ScrollView, View, StyleSheet, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

const androidBehavior = Platform.OS === 'ios' ? 'padding' : 'padding';

interface KeyboardAwareModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  keyboardVerticalOffset?: number;
  animationType?: 'none' | 'slide' | 'fade';
  presentationStyle?: 'pageSheet' | 'fullScreen' | 'formSheet' | 'overFullScreen';
  /** If true, content is wrapped in ScrollView with keyboardShouldPersistTaps. */
  scroll?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
}

export function KeyboardAwareModal({
  visible,
  onRequestClose,
  children,
  keyboardVerticalOffset = 0,
  animationType = 'slide',
  presentationStyle = 'pageSheet',
  scroll = true,
  style,
  contentContainerStyle,
}: KeyboardAwareModalProps) {
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      animationType={animationType}
      presentationStyle={presentationStyle}
      onRequestClose={onRequestClose}
    >
      <KeyboardAvoidingView
        style={[styles.wrapper, style]}
        behavior={androidBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={contentContainerStyle}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={style}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1 },
});
```

### 3. Shared constant for behavior (optional)

```ts
// lib/keyboard.ts or constants/Keyboard.ts
import { Platform } from 'react-native';
export const KEYBOARD_AVOIDING_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'padding';
export const KEYBOARD_AVOIDING_BEHAVIOR_HEIGHT = Platform.OS === 'ios' ? 'padding' : 'height';
```

### 4. DisputeAuditSheet — add KAV (minimal change)

```tsx
// Inside DisputeAuditSheet, replace:
return (
  <Modal ...>
    <View style={styles.container}>
      ...
    </View>
  </Modal>
);
// with:
return (
  <Modal ...>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.container}>
        ...
      </View>
    </KeyboardAvoidingView>
  </Modal>
);
```

### 5. Any existing Modal form — set Android behavior

Replace:

```tsx
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
```

with:

```tsx
behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
```

(or use `'height'` on Android for full-page modals like AddTransactionModal if that behaves better on your devices.)

---

## Summary

- **Root cause:** Modal content on Android doesn’t get the window resize from `softwareKeyboardLayoutMode: 'resize'`, and most screens use `KeyboardAvoidingView` with `behavior={undefined}` on Android.
- **Fix:** Use an explicit Android behavior (`padding` or `height`) in every Modal/form that uses KeyboardAvoidingView, add KAV to DisputeAuditSheet, and standardize ScrollView with `keyboardShouldPersistTaps="handled"` wherever inputs or taps matter.
- **Global pattern:** Introduce `KeyboardAwareLayout` and optionally `KeyboardAwareModal`, plus a shared behavior constant, and refactor critical modals and form screens to use them so the app scales consistently.
