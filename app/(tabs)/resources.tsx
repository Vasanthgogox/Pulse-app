import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const ResourcesScreen = lazy(() => import('@/features/fleet/screens/ResourcesScreen'));

export default function ResourcesRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <ResourcesScreen />
    </Suspense>
  );
}
