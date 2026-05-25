// Root-level Expo Router Suspense fallback — intentionally empty so in-app
// navigations don't flash a full-screen splash while Metro compiles route chunks.
// Heavy routes that need a branded loader define their own loading.tsx.
export default function RootRouteLoading() {
  return null;
}
