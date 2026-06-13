import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const AddDriverScreen = lazy(() => import('@/features/drivers/screens/AddDriverScreen'));

export default function AddDriverRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <AddDriverScreen />
    </Suspense>
  );
}
