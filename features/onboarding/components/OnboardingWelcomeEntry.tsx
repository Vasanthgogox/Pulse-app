import { Redirect, useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OperationalButton, OperationalHeader } from '@/components/operational';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { ROUTES } from '@/lib/routes';
import { colors } from '@/design-system/colors';
import { layout } from '@/design-system/layout';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';
import { OperationalPersonaOption } from './OperationalPersonaOption';

/**
 * Web / entry activation chooser — operational split, not marketing cards.
 */
export function OnboardingWelcomeEntry() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isOnline = useIsOnline();
  const { user } = useAuth();

  if (user) {
    return <Redirect href={ROUTES.INDEX} />;
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {!isOnline ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>No network — activation paused.</Text>
        </View>
      ) : null}

      <OperationalHeader
        variant="stack"
        title="Pulse logistics network"
        subtitle="Activate your operational role"
        trailing={
          <OperationalButton
            intent="utility"
            label="Sign in"
            onPress={() => router.push(ROUTES.SIGN_IN)}
          />
        }
        skipSafeAreaTop
      />

      <View style={styles.split}>
        <OperationalPersonaOption
          title="Transport operator"
          subtitle="Provision dispatch, fleet, trips, and finance workspace."
          icon="building"
          onPress={() => router.push(ROUTES.ONBOARDING.HUB)}
        />
        <OperationalPersonaOption
          title="Fleet workforce"
          subtitle="Driver identity, compliance documents, trip execution."
          icon="truck"
          onPress={() => router.push(ROUTES.ONBOARDING.DRIVER)}
        />
      </View>

      <View style={[styles.footer, { paddingHorizontal: layout.screenPaddingX }]}>
        <OperationalButton
          intent="bottomSticky"
          label="Explore activation paths"
          onPress={() => router.push(ROUTES.ONBOARDING.HUB)}
          fullWidth
        />
        {Platform.OS === 'web' ? (
          <OperationalButton
            intent="utility"
            label="Return to website"
            onPress={() => router.replace(ROUTES.TERMINAL_WEBSITE)}
            fullWidth
            style={styles.backWeb}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.operational,
  },
  offline: {
    marginHorizontal: layout.screenPaddingX,
    marginTop: space[2],
    padding: space[3],
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  offlineText: {
    textAlign: 'center',
    color: colors.cost,
    fontSize: 12,
    fontWeight: '600',
  },
  split: {
    flex: 1,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: space[4],
    maxWidth: layout.contentMaxWidthWide,
    alignSelf: 'center',
    width: '100%',
  },
  footer: {
    paddingTop: space[3],
    paddingBottom: space[4],
    gap: space[3],
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    width: '100%',
  },
  backWeb: {
    marginTop: space[1],
  },
});
