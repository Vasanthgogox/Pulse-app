import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  OperationalButton,
  OperationalEmptyState,
  OperationalHeader,
  Surface,
} from '@/components/operational';
import { ROUTES } from '@/lib/routes';
import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';
import { ActivationCheckpointList } from './ActivationCheckpointList';
import { onboardingLayout } from '../styles/onboardingLayout';

/**
 * Team-invite activation entry.
 * Preserves org context — user must not accidentally create a new workspace.
 */
export function JoinTeamOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <OperationalHeader
        variant="onboarding"
        title="Join your operator"
        subtitle="Activate into an existing Pulse workspace using your invite."
        onBack={() => router.back()}
        breadcrumbs={['Activation', 'Team invite']}
        metrics={
          <ActivationCheckpointList
            density="high"
            checkpoints={[
              {
                id: 'signin',
                label: 'Sign in with invited email',
                detail: 'Use the address your admin invited',
                status: 'in_progress',
              },
              {
                id: 'accept',
                label: 'Accept workspace invite',
                detail: 'In-app inbox rolling out',
                status: 'pending',
              },
              {
                id: 'access',
                label: 'Operational access granted',
                status: 'pending',
              },
            ]}
          />
        }
      />

      <ScrollView
        contentContainerStyle={[
          onboardingLayout.contentInner,
          { paddingBottom: insets.bottom + space[6], paddingTop: space[4] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Surface elevation={1} density="low">
          <View style={styles.iconRow}>
            <FontAwesome name="envelope-open" size={22} color={colors.brand} />
            <Text style={styles.surfaceTitle}>Organization-aware activation</Text>
          </View>
          <Text style={styles.surfaceBody}>
            Your administrator provisioned a seat in their workspace. Sign in first —
            do not start a new transport business signup unless you are opening a new
            operator account.
          </Text>
        </Surface>

        <View style={styles.actions}>
          <OperationalButton
            intent="primary"
            label="Sign in to accept invite"
            onPress={() => router.push(ROUTES.SIGN_IN)}
            fullWidth
          />
          <OperationalButton
            intent="utility"
            label="I need a new operator workspace"
            onPress={() => router.push(ROUTES.ONBOARDING.BUSINESS)}
            fullWidth
            style={styles.secondary}
          />
        </View>

        <OperationalEmptyState
          icon="warning"
          title="Accidental workspace creation"
          description="If you pick Transport business signup, Pulse creates a separate organization. Team members should use sign-in with their invite email."
          secondaryAction={{
            label: 'Contact your admin',
            intent: 'utility',
            onPress: () => router.push(ROUTES.SIGN_IN),
          }}
          density="high"
          style={styles.empty}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginBottom: space[3],
  },
  surfaceTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
  },
  surfaceBody: {
    ...typography.caption,
    lineHeight: 20,
  },
  actions: {
    marginTop: space[5],
    gap: space[3],
  },
  secondary: {
    marginTop: space[1],
  },
  empty: {
    marginTop: space[6],
    paddingHorizontal: 0,
  },
});
