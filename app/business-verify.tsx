import { useEffect } from 'react';
import { View } from 'react-native';

import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { ROUTES } from '@/lib/routes';
import { useRouter } from 'expo-router';

/** Legacy route — verification lives under Workspace → Organization. */
export default function BusinessVerifyScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace({
      pathname: ROUTES.WORKSPACE,
      params: { panel: 'kyc', section: 'verification' },
    } as Parameters<typeof router.replace>[0]);
  }, [router]);

  return (
    <View style={{ flex: 1 }}>
      <CenteredLoadingView />
    </View>
  );
}
