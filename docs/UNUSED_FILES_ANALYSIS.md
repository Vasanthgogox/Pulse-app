# Unused Files Analysis (Storage Optimization)

Analysis date: 2025-02-27. These files are not imported or referenced by the app and can be removed.

## Safe to delete (no references)

Unused files removed:

- `demo.tsx` — removed (root-level demo; no imports).
- `demo2.tsx` — removed (root-level demo; no imports).
- `components/NetworkHandshakeOverlay.tsx` — previously removed.

## Already removed (previously listed)

- `web page for the same layout.tsx`, `components/HomeSummaryBanner.tsx`, `components/ListBody.tsx`, `components/TopTabsHeader.tsx`, `components/TripCard.tsx`, `components/FABMenu.tsx`, `components/useClientOnlyValue.ts`, `components/useClientOnlyValue.web.ts` — no longer in repo.

## Optional (delete after refactor or if not needed)

| File | Notes |
|------|--------|
| `components/AddTripModal.tsx` | (Deleted) Re-export only; all imports use `@/components/add-trip`. |
| `migrations/001_initial_schema_consolidated.sql` | Schema lives in Q-unified-base; keep only if you use it as local reference. |
| `constants/Colors.ts` | Only used by `Themed.tsx` and `EditScreenInfo.tsx`. Delete after migrating modal, settings, +not-found to `Theme`. |
| `components/Themed.tsx` | Used by `app/modal.tsx`, `app/+not-found.tsx`. Settings now uses Theme + plain View/Text. Remove after modal and +not-found use Theme. |
| `components/EditScreenInfo.tsx` | Used only by `app/modal.tsx`. Remove when modal content is updated. |
| `components/StyledText.tsx` | Used by EditScreenInfo. Remove with EditScreenInfo. |
| `components/ExternalLink.tsx` | Used by EditScreenInfo. Remove with EditScreenInfo. |
| `components/__tests__/StyledText-test.js` | Tests StyledText. Remove with StyledText. |

## In use (do not delete)

- All `app/**` routes (used by Expo Router).
- `contexts/*`, `services/*`, `lib/*` (except optional migrations) — all referenced.
- `components/demo/*`, `components/add-trip/*`, `components/finance/*`, `components/ListScreenLayout`, `LoadBoardModal`, `TeslaHeader`, `DetailPageLayout`, `WizardStepLayout`, `FAB`, `EntityRow`, `SummaryCard`, etc. — all have current imports.
- `constants/Theme.ts` — primary theme; used everywhere.
