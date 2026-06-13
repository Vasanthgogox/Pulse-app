import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const AddClientScreen = lazy(() => import('@/features/clients/screens/AddClientScreen'));

export default function AddClientRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <AddClientScreen />
    </Suspense>
  );
}
