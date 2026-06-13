import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const LedgerSyncScreen = lazy(() => import('@/features/finance/screens/LedgerSyncScreen'));

export default function LedgerSyncRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <LedgerSyncScreen />
    </Suspense>
  );
}
