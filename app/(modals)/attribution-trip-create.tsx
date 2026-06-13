import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const AttributionTripCreateModal = lazy(() => import('@/features/trips/screens/AttributionTripCreateScreen'));

export default function AttributionTripCreateRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <AttributionTripCreateModal />
    </Suspense>
  );
}
