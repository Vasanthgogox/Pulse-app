import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const PostDetailScreen = lazy(() => import('@/features/network/screens/PostDetailScreen'));

export default function PostDetailRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <PostDetailScreen />
    </Suspense>
  );
}
