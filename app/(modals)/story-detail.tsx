import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const StoryDetailScreen = lazy(() => import('@/features/network/screens/StoryDetailScreen'));

export default function StoryDetailRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <StoryDetailScreen />
    </Suspense>
  );
}
