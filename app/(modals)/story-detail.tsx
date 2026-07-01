import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { lazy, Suspense, useEffect } from 'react';

const StoryDetailScreen = lazy(() => import('@/features/network/screens/StoryDetailScreen'));

export default function StoryDetailRoute() {
  const { user, status } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ postId?: string; orgId?: string; storyType?: string; queue?: string }>();

  useEffect(() => {
    if (status === 'restoring') return;
    if (!user) {
      const entries = Object.entries(params).filter(([, v]) => typeof v === 'string') as [string, string][];
      const qs = new URLSearchParams(Object.fromEntries(entries)).toString();
      const returnTo = encodeURIComponent(`/story-detail?${qs}`);
      router.replace(`/sign-in?returnTo=${returnTo}`);
    }
  }, [user, status]);

  if (!user) return null;

  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <StoryDetailScreen />
    </Suspense>
  );
}
