import { LazyRouteScreen } from '@/components/LazyRouteScreen';

/** Thin route — Suspense splash while Metro bundles _network-screen. */
export default function NetworkTab() {
  return (
    <LazyRouteScreen
      loader={() => import('./_network-screen')}
      message="Loading network…"
    />
  );
}
