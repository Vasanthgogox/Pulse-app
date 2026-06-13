import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const DriverChatScreen = lazy(() => import('@/features/drivers/screens/DriverChatScreen'));

export default function DriverChatRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <DriverChatScreen />
    </Suspense>
  );
}
