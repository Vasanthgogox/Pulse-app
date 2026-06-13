import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const CreatePostScreen = lazy(() => import('@/features/network/screens/CreatePostScreen'));

export default function CreatePostRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <CreatePostScreen />
    </Suspense>
  );
}
