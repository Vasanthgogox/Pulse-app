import { useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { OperationalHeader } from '@/components/operational';
import { BusinessVerificationWizard } from '@/features/organization/components/workspace/BusinessVerificationWizard';
import { ROUTES } from '@/lib/routes';

export default function BusinessVerifyScreen() {
  const router = useRouter();
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.WORKSPACE);
  };

  return (
    <View style={styles.root}>
      <OperationalHeader title="Verify Business" onBack={handleBack} />
      <BusinessVerificationWizard onDone={handleBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
