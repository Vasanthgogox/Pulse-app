# Driver app maps: why @mapcn/map doesn't work here

## What happened when you ran `npx shadcn@latest add @mapcn/map`

1. **Tailwind check failed**  
   The shadcn CLI looks for a Tailwind CSS config (e.g. `tailwind.config.js` or NativeWind for Expo). This repo has **no Tailwind and no NativeWind** — it uses React Native `StyleSheet` and `@/constants/Theme`. So the command stops with:

   ```
   ✖ Validating Tailwind CSS.
   No Tailwind CSS configuration found at ...
   Install Tailwind CSS then try again.
   Visit https://www.nativewind.dev/docs/getting-started/installation to get started.
   ```

2. **@mapcn/map is for web/shadcn, not React Native**  
   [Mapcn](https://mapcn.dev/) is a **React (web)** map component built for **shadcn/ui**: MapLibre GL + Tailwind. It targets DOM/browser, not native iOS/Android views. It also **requires** Tailwind and shadcn already set up.

## What to use in pulse instead

- **Native driver/app maps:** Use **react-native-maps** (already in `package.json`). It renders real native map views (Apple MapKit / Google Maps) and is the right choice for the driver dashboard and trip screens.
- **Do not add** Tailwind/NativeWind or shadcn just to use @mapcn/map in this app; that would be a large, unnecessary stack change and mapcn still wouldn’t run in native views.

For adding a real map to the driver dashboard, see the fix summary in the earlier analysis: use `react-native-maps` in `app/(driver)/index.tsx` only; leave `control.tsx` and `TrackingMapBlock` (schematic route) unchanged.
