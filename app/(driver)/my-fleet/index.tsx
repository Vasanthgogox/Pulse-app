import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const MyFleetScreen = lazy(
  () => import('@/features/driver/components/MyFleetScreen'),
);

export default function MyFleetIndexRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <MyFleetScreen />
    </Suspense>
  );
}
