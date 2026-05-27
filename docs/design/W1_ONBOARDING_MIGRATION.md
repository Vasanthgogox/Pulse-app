# W1 — Onboarding operational migration

## Goal

Transform onboarding from multi-step signup forms into **operational workspace activation** using `@/components/operational` and `@/design-system`.

## Shipped

### New infrastructure (`features/onboarding/`)

| Component | Role |
|-----------|------|
| `OnboardingActivationShell` | Mobile shell: `OperationalHeader`, trust bar, progress rail |
| `OnboardingKeypadStep` | Phone/OTP with keypad + `OperationalBottomActionBar` |
| `OnboardingScrollStep` | Focused single-field flows |
| `OnboardingStepHero` | Calm step title block |
| `OnboardingProgressRail` | Step visibility |
| `OnboardingTrustBar` | Identity → verification → workspace → compliance |
| `ActivationCheckpointList` | Fintech-grade activation checkpoints |
| `OperationalPersonaOption` | Persona rows (not bordered cards) |
| `OperationalSelectorGroup` | Operating model, fleet, volume selectors |
| `OnboardingFocusedField` | Design-system text inputs |
| `OnboardingDesktopActivationLayout` | Enterprise split panel (desktop business — ready) |
| `OnboardingWelcomeEntry` | Web entry activation |
| `trustProgress.ts` | Business vs driver trust mapping |

### Migrated screens

| Route | Status |
|-------|--------|
| `/welcome` | → `OnboardingWelcomeEntry` |
| `/onboarding` | Persona hub operational redesign |
| `/onboarding/join-team` | Invite-aware activation + checkpoints |
| `/onboarding/business` | All 7 business steps on operational primitives |
| `/driver-signup` | Shell + trust + contextual headers (body steps partial) |

### Legacy removal map

| Legacy | Replacement |
|--------|-------------|
| `signUpMobile.styles` primary buttons | `OperationalButton` |
| `SignUpMobileShell` internals | `OnboardingActivationShell` |
| `SignUpKeypadStepLayout` | `OnboardingKeypadStep` (re-export) |
| `SignUpMobileTextStep` | `OnboardingScrollStep` (re-export) |
| Persona `TouchableOpacity` cards | `OperationalPersonaOption` |
| `modelCard` / chip rows (details) | `OperationalSelectorGroup` |
| Welcome marketing split cards | Operational persona split |
| Success checkmark-only UX | `ActivationCheckpointList` + trust states |

### Still on legacy (follow-up)

- `businessSignUp.styles.ts` — desktop business layout (password strength, desktop pager)
- `driver-signup.tsx` — document upload steps (1800-line monolith; shell migrated)
- `signUpMobile.styles.ts` — deprecated tokens; remove when driver body migrated
- Real invite-token accept RPC wiring
- `OperationalSkeleton` in onboarding loading states

## Before vs after (behavioral)

| Before | After |
|--------|-------|
| "Welcome aboard for business" | "Activate your operator identity" |
| "Get started on Pulse" | "What brings you to Pulse?" (role/workspace) |
| Generic progress dots | Trust bar + activation checkpoints |
| Card-stacked persona choices | Operational list rows |
| Inline primary buttons | `OperationalBottomActionBar` on mobile commits |
| "Create account" | "Activate account" / "Enter operations" |

## Accessibility

- `OperationalHeader` back + breadcrumbs with labels
- Progress rail `accessibilityRole="tablist"`
- Persona options `accessibilityRole="button"`
- Error fields `accessibilityRole="alert"`
- Touch targets ≥44pt via operational button + row min-heights

## Performance

- Moti step hero: 240ms timing (calm, no flashy onboarding)
- No new spinner-lock paths; skeleton integration deferred
- Keypad steps avoid OS keyboard on phone/OTP (unchanged, operational layout)

## Test plan

1. `/onboarding` — all 4 personas navigate correctly
2. `/onboarding/business` — full flow mobile + desktop
3. `/onboarding/join-team` — sign-in CTA, no accidental org copy
4. `/driver-signup` — trust bar updates per step; phone keypad works
5. `/welcome` web — operational entry, sign-in, hub CTA
