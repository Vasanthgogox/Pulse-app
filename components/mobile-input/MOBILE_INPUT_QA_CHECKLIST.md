# SmartInput QA Checklist

Run this before promoting any SmartInput migration to main. Test all sections for every new screen that gets migrated.

---

## Setup

- [ ] Dev server running: `npm run web` (port 8081)
- [ ] iOS simulator running (native test)
- [ ] Confirm TypeScript passes: `npx tsc --noEmit 2>&1 | grep mobile-input` — zero output expected

---

## 1. Entry screen — open / close

| # | Test | Pass |
|---|------|------|
| 1.1 | Tap trigger → entry screen opens | |
| 1.2 | Tap ✕ → entry screen closes, value unchanged | |
| 1.3 | On mobile: screen slides up from bottom (native modal) | |
| 1.4 | On tablet: centered modal with spring scale-in (0.94 → 1) | |
| 1.5 | On desktop: right drawer with spring slide-in from right (480px wide) | |
| 1.6 | On desktop: tapping the backdrop closes the drawer | |
| 1.7 | Header label matches the `label` prop | |
| 1.8 | Context line renders if `context` is passed | |
| 1.9 | No context line renders if `context` is omitted | |
| 1.10 | Party banner renders if `partyPreview` is passed | |
| 1.11 | No party banner renders if `partyPreview` is omitted | |

---

## 2. Keypad — digit entry

| # | Test | Pass |
|---|------|------|
| 2.1 | Tapping 1–9 appends the digit | |
| 2.2 | "0" at the start stays "0" (no "00") | |
| 2.3 | Typing "5" when display shows "0" replaces it with "5" | |
| 2.4 | Display formats with Indian locale commas: 1000 → "1,000", 100000 → "1,00,000" | |
| 2.5 | Maximum 9 integer digits — 10th digit is rejected | |
| 2.6 | After reaching max digits, display doesn't change | |

---

## 3. Keypad — decimal entry

| # | Test | Pass |
|---|------|------|
| 3.1 | Tapping "." appends a dot | |
| 3.2 | After ".", typing "5" gives "X.5" | |
| 3.3 | After "X.5", typing another digit gives "X.5Y" | |
| 3.4 | After 2 decimal digits, further digits are rejected (precision lock) | |
| 3.5 | Double-tapping "." doesn't add a second dot | |
| 3.6 | When `allowDecimal={false}`: "." key does nothing | |
| 3.7 | When `maxDecimalPlaces={1}`: only 1 decimal digit accepted | |
| 3.8 | Entry display preserves trailing dot: "100." shows as "100." | |

---

## 4. Keypad — backspace

| # | Test | Pass |
|---|------|------|
| 4.1 | Single tap backspace removes last character | |
| 4.2 | Backspace on "100." gives "100" | |
| 4.3 | Backspace on "0." gives "0" | |
| 4.4 | Backspace on "5" gives "" (empty, shows placeholder) | |
| 4.5 | Backspace on empty does nothing | |
| 4.6 | Long-press backspace: after ~400ms, rapid delete starts | |
| 4.7 | Long-press delete fires at ~60ms intervals | |
| 4.8 | Releasing long-press stops rapid delete immediately | |
| 4.9 | Rapid delete stops at empty string (no crash) | |

---

## 5. Display — amount area

| # | Test | Pass |
|---|------|------|
| 5.1 | Empty state shows placeholder (default "0") | |
| 5.2 | Blinking cursor visible when empty | |
| 5.3 | Blinking cursor visible next to non-empty value | |
| 5.4 | `currency` type: "₹" prefix shown | |
| 5.5 | `percentage` type: "%" suffix shown | |
| 5.6 | `prefix=""` suppresses the prefix | |
| 5.7 | `suffix=""` suppresses the suffix | |
| 5.8 | Large amount (₹99,99,999) fits on one line without clipping | |
| 5.9 | Font shrinks (`adjustsFontSizeToFit`) if value is very long | |

---

## 6. Submit / Apply

| # | Test | Pass |
|---|------|------|
| 6.1 | Apply button is disabled (muted) when entry is empty | |
| 6.2 | Apply button is active after entering any non-zero digit | |
| 6.3 | Tapping Apply calls `onChange` with the correct raw string | |
| 6.4 | Tapping Apply closes the entry screen | |
| 6.5 | Trigger field updates to show the submitted value | |
| 6.6 | Submitting "45000." sends "45000" (trailing dot stripped) | |
| 6.7 | `submitLabel` prop changes the button text | |

---

## 7. Validation

| # | Test | Pass |
|---|------|------|
| 7.1 | `required`: submitting empty shows "This field is required" | |
| 7.2 | `required`: error shown inline below the amount display | |
| 7.3 | `required`: entering a value and submitting clears the error | |
| 7.4 | `validation.min=100`: submitting 50 shows min error | |
| 7.5 | `validation.max=10000`: submitting 15000 shows max error | |
| 7.6 | Exceeding SMART_INPUT_AMOUNT_MAX (₹9,99,99,999) shows max error | |
| 7.7 | `allowDecimal={false}`: submitting "45.5" shows integer-only error | |
| 7.8 | `validation.custom`: custom error message shown if custom fn returns string | |
| 7.9 | Validation error does NOT close the entry screen — user stays to correct | |
| 7.10 | Opening a fresh entry screen clears any previous validation error | |

---

## 8. Initial value and re-opening

| # | Test | Pass |
|---|------|------|
| 8.1 | When `value` is non-zero, trigger shows the formatted value | |
| 8.2 | Opening the entry screen pre-fills with the current value | |
| 8.3 | Closing without submitting leaves the original value unchanged | |
| 8.4 | Submitting a new value, closing, then re-opening shows the new value | |
| 8.5 | `value=0` → trigger shows placeholder, entry screen shows placeholder | |
| 8.6 | `value="0.00"` → same as value=0 (empty state) | |

---

## 9. Trigger field

| # | Test | Pass |
|---|------|------|
| 9.1 | `variant="row"` renders the row layout | |
| 9.2 | `variant="field"` renders the field layout | |
| 9.3 | `disabled={true}` — trigger is not tappable | |
| 9.4 | `disabled={true}` — entry screen does not open | |
| 9.5 | `errorMessage` from parent renders below the trigger | |
| 9.6 | `valueColor="positive"` — value text is green | |
| 9.7 | `valueColor="negative"` — value text is red | |
| 9.8 | `valueColor="auto"` — positive value is green, zero/empty is default | |

---

## 10. Platform — mobile (iOS Safari / Android Chrome)

| # | Test | Pass |
|---|------|------|
| 10.1 | No native keyboard ever appears during numeric entry | |
| 10.2 | Full-screen modal covers status bar area cleanly | |
| 10.3 | Safe area padding correct at top (insets applied) | |
| 10.4 | Safe area padding correct at bottom (insets applied) | |
| 10.5 | Back gesture (swipe down / back button) triggers `onClose` | |
| 10.6 | Haptic feedback fires on keypress (iOS device) | |
| 10.7 | Haptic feedback fires on apply (success notification) | |
| 10.8 | Haptic feedback fires on validation error (error notification) | |
| 10.9 | No haptic crash or console error on web | |

---

## 11. Platform — tablet (768–1023px width)

| # | Test | Pass |
|---|------|------|
| 11.1 | Centered modal appears (not full-screen) | |
| 11.2 | Modal width ≤ 480px | |
| 11.3 | Backdrop tap closes the modal | |
| 11.4 | Spring scale-in animation plays on open | |
| 11.5 | Landscape orientation: modal still fits vertically (maxHeight: 85%) | |
| 11.6 | Scrollable if content overflows (check with long context + banner) | |

---

## 12. Platform — desktop web (≥1024px)

| # | Test | Pass |
|---|------|------|
| 12.1 | Right-side drawer opens (not full-screen or centered modal) | |
| 12.2 | Drawer width is 480px | |
| 12.3 | Spring slide-in from right plays on open | |
| 12.4 | Backdrop (left side) is semi-transparent | |
| 12.5 | Backdrop click closes the drawer | |
| 12.6 | Keyboard navigation: Tab to trigger, Enter opens | |
| 12.7 | Escape key closes the drawer | |

---

## 13. Accessibility

| # | Test | Pass |
|---|------|------|
| 13.1 | Entry modal has `accessibilityViewIsModal={true}` | |
| 13.2 | ✕ close button: `accessibilityRole="button"`, label "Cancel" | |
| 13.3 | Apply button: `accessibilityRole="button"`, label matches `submitLabel` | |
| 13.4 | Validation error: `accessibilityRole="alert"` | |
| 13.5 | Backspace key: hint "Hold to delete multiple digits" | |
| 13.6 | All keypad keys have `accessibilityRole="button"` | |
| 13.7 | All keypad keys have min touch target 44×44pt | |
| 13.8 | VoiceOver / TalkBack: screen reader focus moves into modal on open | |
| 13.9 | VoiceOver / TalkBack: focus does not escape to background content | |

---

## 14. Decimal precision stress tests

| # | Test | Pass |
|---|------|------|
| 14.1 | 1/3 of 3 = 1 (no floating point: `1 * 3333 / 10000 !== 0.9999`) — not applicable to SmartInput but verify DB write does not coerce | |
| 14.2 | Enter 99999999 (9 digits) — accepted | |
| 14.3 | Enter 999999999 (9 nines) then another digit — rejected | |
| 14.4 | Enter "12345678.99" — exactly at precision boundary, accepted | |
| 14.5 | Enter "12345678.999" — third decimal rejected (stays at .99) | |
| 14.6 | Enter "0.01" — minimum non-zero cent value accepted and submitted | |
| 14.7 | Rapid-tap a digit 20 times — no double-entry, no crash | |
| 14.8 | Enter amount, close, reopen, submit immediately — value is stable | |

---

## 15. Regression — surrounding form

| # | Test | Pass |
|---|------|------|
| 15.1 | Other form fields still work after SmartInput submission | |
| 15.2 | Form submit (Save / Create) works after SmartInput entry | |
| 15.3 | Form validation highlighting still fires for non-SmartInput fields | |
| 15.4 | SmartInput field clears correctly on form reset | |
| 15.5 | Multiple SmartInput fields in one form — each opens independently | |
| 15.6 | Multiple SmartInput fields — submitting one does not affect another's value | |

---

## Sign-off

After all sections pass, record:

```
Tester:
Device/Browser:
Date:
Build / commit:
Notes:
```
