# UI Patterns

## Libraries
- Lists: `@shopify/flash-list` (performance-critical)
- Bottom sheets: `@gorhom/bottom-sheet`
- Animations: `moti`
- Icons: `lucide-react-native`

## Theme
Always use `constants/Theme.ts` tokens — never raw colors or hardcoded hex values.

## i18n
All user-facing strings via `lib/i18n.ts`. 6 languages: EN, HI, TE, TA, KN, ML.

## Platform Splits
Map and PDF components use `.native.tsx` / `.web.tsx` file variants.
**Changes to these must be verified on both platforms.**
- Map: `lib/mapLibreCompat.native.tsx` / `.web.tsx`
- PDF/invoicing: `features/invoicing/` — native uses `react-native-pdf-lib`, web uses browser APIs

## Shared Utilities
- `lib/format.ts` — currency, distance, duration formatting
- `lib/validation.ts` — email, phone, password
- `lib/entityIdentity.ts` — avatar seeds, colors by entity type
- `lib/placesService.ts` — location search (Mapbox → Google → Nominatim fallback)
- `lib/pagination.ts` — page size constants
- `lib/avatarUpload.ts` — avatar signed URL resolution
