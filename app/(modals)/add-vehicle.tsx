import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const AddVehicleScreen = lazy(() => import('@/features/vehicles/screens/AddVehicleScreen'));

export default function AddVehicleRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <AddVehicleScreen />
    </Suspense>
  );
}
