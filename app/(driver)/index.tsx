import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const DriverHome = lazy(() => import('@/features/drivers/screens/DriverHomeScreen'));

export default function DriverHomeRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <DriverHome />
    </Suspense>
  );
}
