# UI Audit: Elements With No Real Functionality

Project-wide scan of `.tsx`/`.ts` in `app/`, `components/`, `features/` for UI elements that are visible but have no or placeholder functionality.

---

## FILE: app/(tabs)/clients.tsx
─────────────────────────────
**FAB** at line ~102:
  Code: `fab={<FAB label="Add Customer" onPress={() => {}} />}`
  Issue: FAB has empty onPress; tapping "Add Customer" does nothing.
  Suggested fix: Wire to open Add Client modal, e.g. `onPress={() => router.push('/(modals)/add-client')}` (ensure modals are reachable from tabs).

---

## FILE: app/(tabs)/indents.tsx
─────────────────────────────
**FAB** at line ~91:
  Code: `fab={<FAB label="Add Indent" onPress={() => {}} />}`
  Issue: FAB has empty onPress; "Add Indent" does nothing.
  Suggested fix: Navigate to create-indent, e.g. `onPress={() => router.push('/create-indent')}`.

**EntityRow** at line ~105:
  Code: `onPress={() => {}}`
  Issue: Each indent row is tappable but does nothing.
  Suggested fix: If an indent detail screen exists, navigate (e.g. `router.push(\`/indent/${i.id}\`)`); otherwise add route and wire, or remove onPress and make row non-clickable.

---

## FILE: app/(tabs)/report.tsx
─────────────────────────────
**Date/Filter/Download/Share handlers** at lines ~38–68:
  Code: `onStartDatePress={() => { // TODO: Open date picker; console.log('Start date pressed'); }}`, same pattern for `onEndDatePress`, `onFilterPress`, `onDownloadPress`, `onSharePress`.
  Issue: All five actions only log to console; no date picker, filter modal, download, or share.
  Suggested fix: Implement date picker (e.g. expo date picker or modal), filter modal state + UI, file download (e.g. export CSV/PDF), and Share.share() for share.

---

## FILE: app/(tabs)/finance.tsx
─────────────────────────────
**TouchableWithoutFeedback** at line ~1840:
  Code: `<TouchableWithoutFeedback onPress={() => {}}>`
  Issue: Inner panel uses empty onPress to block tap-from-closing modal; functionally works but is a no-op handler.
  Suggested fix: Keep as-is for stop-propagation, or use `onPress={(e) => e?.stopPropagation?.()}` if preferred; optionally add a comment that the empty handler is intentional.

---

## FILE: app/(tabs)/profile.tsx
─────────────────────────────
**TouchableOpacity** at line ~557:
  Code: `<TouchableOpacity style={styles.matrixRow} activeOpacity={0.7}>` (no onPress)
  Issue: "Linked Devices" row looks tappable (chevron-right) but has no onPress.
  Suggested fix: Add onPress to open hardware/settings or remove chevron and make it non-interactive.

---

## FILE: app/(driver)/index.tsx
─────────────────────────────
**TouchableOpacity (notification bell)** at line ~296:
  Code: `onPress={() => {}}`
  Issue: Header notification button does nothing.
  Suggested fix: Navigate to requests/notifications screen (e.g. `router.push('/(driver)/requests')`) or open a notifications modal.

---

## FILE: app/(driver)/requests.tsx
─────────────────────────────
**TouchableOpacity (notification bell)** at line ~101:
  Code: `onPress={() => {}}`
  Issue: Bell icon in header has no action.
  Suggested fix: Open notification list/modal or navigate to notification settings; or remove if duplicate of another control.

---

## FILE: app/(driver)/control.tsx
─────────────────────────────
**TouchableOpacity (SOS)** at line ~417:
  Code: `<TouchableOpacity style={[styles.issueBtn, ...]} activeOpacity={0.8}>` (no onPress)
  Issue: "SOS" button is visible but has no onPress.
  Suggested fix: Implement SOS (e.g. trigger emergency contact, send location, or show alert/confirm then call API).

---

## FILE: components/LoadBoardModal.tsx
─────────────────────────────
**TouchableOpacity (indent card)** at line ~157:
  Code: `onPress={() => {}}`
  Issue: Each load-board indent card is tappable but does nothing.
  Suggested fix: Navigate to indent detail or open a detail bottom sheet; pass an `onIndentPress(indent)` prop from parent and wire it.

---

## FILE: components/demo/TeslaHeader.tsx
─────────────────────────────
**TouchableOpacity (bell icon)** at line ~47:
  Code: `<TouchableOpacity style={styles.iconBtn} hitSlop={8}>` (no onPress)
  Issue: Bell icon has no handler.
  Suggested fix: Add optional `onNotificationClick` prop and call it onPress, or document that notifications are not implemented and hide/disable the icon.

---

## FILE: features/finance/components/EntityCompareVerifyView.tsx
─────────────────────────────
**TouchableOpacity (Attach Proof)** at line ~1061:
  Code: `onPress={() => {}}`
  Issue: "Attach Proof" button does nothing.
  Suggested fix: Open image/document picker, upload file, and store proof URL or base64 for the dispute submission.

---

## FILE: features/ops-agent/OpsAgentScreen.tsx
─────────────────────────────
**Hardcoded contact in "Add contact"** at line ~1773:
  Code: `setPendingAttachment({ type: "contact", data: { name: "Raj Kumar", role: "Prime Pilot", phone: "+91 98765 43210" } })`
  Issue: "Add contact" always uses the same mock contact instead of real contact picker.
  Suggested fix: Integrate expo-contacts or native contact picker and set attachment from selected contact; keep mock only for dev/fallback if no permission.

---

## FILE: app/(tabs)/network.tsx
─────────────────────────────
**Mock data for empty/pending state** at lines ~122, 139, 149:
  Code: `const mockPending: NetworkNode[] = [...]`, `setNodes(mockPending)`, `const list: NetworkNode[] = [...mockPending]`
  Issue: Uses hardcoded mock nodes for UI; not necessarily broken but not real data.
  Suggested fix: Replace with real API or empty array and proper empty state; use mock only in __DEV__ or storybook if needed.

---

## Summary: Placeholder / TODO comments (no UI change)

- **contexts/WalletContext.tsx** ~27: `// TODO: fetch from wallet API` — placeholder comment; wallet UI may still show empty/placeholder data.

---

## PRIORITY TABLE

| # | File | Element | Issue | Effort | Impact |
|---|------|---------|--------|--------|--------|
| 1 | app/(tabs)/clients.tsx | FAB "Add Customer" | Empty onPress | S | High |
| 2 | app/(tabs)/indents.tsx | FAB "Add Indent" | Empty onPress | S | High |
| 3 | app/(tabs)/report.tsx | Date / Filter / Download / Share | TODO + console.log only | M | High |
| 4 | features/finance/components/EntityCompareVerifyView.tsx | "Attach Proof" button | Empty onPress | M | Med |
| 5 | app/(driver)/control.tsx | SOS button | No onPress | M | High |
| 6 | components/LoadBoardModal.tsx | Indent card | Empty onPress | S | Med |
| 7 | app/(tabs)/indents.tsx | EntityRow (each indent) | Empty onPress | S | Med |
| 8 | app/(driver)/index.tsx | Notification bell | Empty onPress | S | Med |
| 9 | app/(driver)/requests.tsx | Notification bell | Empty onPress | S | Low |
| 10 | app/(tabs)/profile.tsx | "Linked Devices" row | No onPress | S | Low |
| 11 | components/demo/TeslaHeader.tsx | Bell icon | No onPress | S | Low |
| 12 | features/ops-agent/OpsAgentScreen.tsx | Add contact | Hardcoded "Raj Kumar" | L | Med |
| 13 | app/(tabs)/finance.tsx | Entity list panel inner tap | onPress={() => {}} (intentional?) | — | Low |
| 14 | app/(tabs)/network.tsx | mockPending | Hardcoded mock nodes | M | Low |

**Effort:** S = small (single handler/nav), M = medium (new flow or picker), L = larger (new integration e.g. contacts).  
**Impact:** High = core flow (FAB, report, SOS), Med = feature completeness, Low = polish or edge screen.
