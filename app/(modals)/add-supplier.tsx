import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const AddSupplierScreen = lazy(() => import('@/features/suppliers/screens/AddSupplierScreen'));

export default function AddSupplierRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <AddSupplierScreen />
    </Suspense>
  );
}
