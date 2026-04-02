# Ops Agent: Refactored vs Reference Comparison

Comparison of the refactored `OpsAgentScreen` (and split modules) with `OpsAgentScreen.reference.tsx`.

---

## 1. Structure Overview

| Aspect | Reference (single file) | Refactored |
|--------|-------------------------|------------|
| **Main screen** | ~2,876 lines, everything in one file | ~214 lines; composes hooks + components |
| **State & handlers** | 20+ `useState` + handlers in screen | In `useOpsAgentChat.ts` (~720 lines) |
| **Ops context fetch** | Inline `useEffect` + `Promise.all` in screen | `useOpsContext.ts` (~115 lines) |
| **Types / constants / utils** | Inline at top of file | `types.ts`, `constants.ts`, `utils.ts` |
| **Styles** | `getStyles(ref)` at bottom of file | `opsAgentStyles.ts` (~520 lines) |
| **UI (toast, header, empty, report, typing, reattempt, input)** | Inline JSX in screen | `components/*.tsx` (7 small files) |
| **Message row (bubble + report + confirm/preview forms)** | Inline in `messages.map()` | `OpsAgentMessageRow.tsx` (~1,530 lines) |

---

## 2. Behavior Parity

### ✅ Preserved

- **Auth & org:** Same `useAuth()`, `useOrganization()`; `userInitial` from profile/email.
- **Theme:** `isDarkMode` state, `REF_DARK` / `REF_LIGHT`, `getOpsAgentStyles(REF)` (memoized).
- **Ops context:** Same data (transactions, vehicles, drivers, clients, suppliers); same summaries/tables and `setOpsContext`.
- **Chat flow:** Same `processOpsMessage` usage, confirmation expiry, pending confirm (client/supplier/vehicle/driver/trip), created preview, reattempt (client), report PDF download.
- **Message list:** Same empty state (single system message), quick pills, scroll-to-end on messages/reattempt.
- **Input:** Same chat input, attachment strip, attach menu (camera, library, add contact), keyboard height handling, send/voice placeholder.
- **Per-message UI:** Same avatar/bubble, edit-message form, report card, pending-confirm forms (all 5 entity types), created-preview summary + edit forms (client/supplier/vehicle/driver; trip has no in-chat update), message actions (copy, edit, thumbs, share, refresh, more).
- **Safe area:** Insets used for toast, header, and input bar.

### 🔧 Fix in refactor

- **Reference bug:** The reference had a typo in the scroll `useEffect` dependency array: `u  },` (stray `u`). The refactored screen uses the correct `}, [messages.length, isTyping, reattemptPayload]);` with no typo.

### ⚪ Minor / cosmetic

- **Unused style:** Reference defines `refHeaderBtnText` in `getStyles`; it is not used in the header. The refactored `opsAgentStyles.ts` does not include it (no behavior change).
- **Prop naming:** Components receive the theme object as `themeRef` instead of `ref` to avoid clashing with React’s `ref` (same theme values passed).

---

## 3. Where Each Part of the Reference Lives Now

| Reference location | Refactored location |
|--------------------|---------------------|
| Lines 53–71 (types) | `types.ts` |
| Lines 74–79 (INITIAL_MESSAGES) | `constants.ts` |
| Lines 81–148 (toNaturalLanguageReply, escapeHtml, reportToHtml, reportToPlainText) | `utils.ts` |
| Lines 152–266 (SP, REF_DARK, REF_LIGHT) | `constants.ts` |
| Lines 268–273 (FONT) | `constants.ts` |
| Lines 324–451 (opsContext useEffect) | `useOpsContext.ts` |
| Lines 453–606 (runProcessMessages) | `useOpsAgentChat.ts` |
| Lines 608–927 (handlers: send, edit, copy, preview update, pending confirm cancel/submit, download PDF, reattempt, photo/pick image, share, “more”) | `useOpsAgentChat.ts` |
| Lines 929–931 (scroll useEffect) | `OpsAgentScreen.tsx` (with typo fixed) |
| Lines 1018–1054 (header JSX) | `components/OpsAgentHeader.tsx` |
| Lines 1065–1088 (empty state + quick pills) | `components/OpsAgentEmptyState.tsx` |
| Lines 1092–1935 (message row: avatar, bubble, edit form, content, attachment, report card, pending confirm, created preview, actions) | `OpsAgentMessageRow.tsx` |
| Lines 1938–1947 (typing indicator) | `components/OpsAgentTypingIndicator.tsx` |
| Lines 1949–1958 (reattempt bubble) | `components/OpsAgentReattemptBubble.tsx` |
| Lines 1962–2055 (input bar + attach menu) | `components/OpsAgentInputBar.tsx` |
| Lines 2060–2876 (getStyles) | `opsAgentStyles.ts` |

---

## 4. File Layout (Refactored)

```
features/ops-agent/
├── OpsAgentScreen.tsx           # Main screen (~214 lines)
├── OpsAgentScreen.reference.tsx # Copy of original (~2,876 lines)
├── OpsAgentMessageRow.tsx        # One message row + all confirm/preview forms (~1,530 lines)
├── types.ts
├── constants.ts
├── utils.ts
├── opsAgentStyles.ts
├── useOpsContext.ts
├── useOpsAgentChat.ts
├── REFACTOR_COMPARISON.md       # This file
└── components/
    ├── index.ts
    ├── OpsAgentSuccessToast.tsx
    ├── OpsAgentHeader.tsx
    ├── OpsAgentEmptyState.tsx
    ├── OpsAgentReportCard.tsx
    ├── OpsAgentTypingIndicator.tsx
    ├── OpsAgentReattemptBubble.tsx
    └── OpsAgentInputBar.tsx
```

---

## 5. Summary

- **Behavior:** Refactored version matches the reference except for the scroll `useEffect` typo fix and the unused `refHeaderBtnText` style removal.
- **Structure:** Logic and styles are split into dedicated modules and hooks; the screen only composes them.
- **Reference file:** Kept as `OpsAgentScreen.reference.tsx` for diffing and rollback; not used at runtime.
