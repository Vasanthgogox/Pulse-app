import { LazyRouteScreen } from '@/components/LazyRouteScreen';

/** Thin route — Suspense splash while Metro bundles _trips-screen (~3k modules). */
export default function TripsTab() {
  return (
    <LazyRouteScreen
      loader={() => import('./_trips-screen')}
      message="Loading trips…"
    />
  );
}
