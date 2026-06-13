import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const ProfileScreen = lazy(() => import('@/features/organization/screens/ProfileScreen'));

export default function ProfileRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <ProfileScreen />
    </Suspense>
  );
}
