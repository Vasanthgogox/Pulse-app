import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  OperationalButton,
  OperationalHeader,
  Surface,
} from '@/components/operational';
import { ONBOARDING_PERSONAS } from '@/lib/onboarding/constants';
import { ROUTES } from '@/lib/routes';
import { colors } from '@/design-system/colors';
import { layout } from '@/design-system/layout';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';
import { OperationalPersonaOption } from './OperationalPersonaOption';
import { OnboardingTrustBar } from './OnboardingTrustBar';
import { onboardingLayout } from '../styles/onboardingLayout';

const PERSONA_ICONS = {
  building: 'building',
  truck: 'truck',
  users: 'users',
  link: 'link',
} as const;

export function OnboardingPersonaHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <OperationalHeader
        variant="onboarding"
        title="What brings you to Pulse?"
        subtitle="Choose your operational role. We provision the right workspace — not a generic signup."
        skipSafeAreaTop={false}
        metrics={<OnboardingTrustBar active="identity" />}
      />

      <ScrollView
        contentContainerStyle={[
          onboardingLayout.contentInner,
          {
            paddingTop: space[4],
            paddingBottom: insets.bottom + space[6],
            maxWidth: layout.contentMaxWidth,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Surface elevation={0} density="low" paddingHorizontal={0} paddingVertical={0}>
          {ONBOARDING_PERSONAS.map((persona) => (
            <OperationalPersonaOption
              key={persona.id}
              title={persona.title}
              subtitle={persona.subtitle}
              icon={PERSONA_ICONS[persona.icon]}
              onPress={() => router.push(persona.route as never)}
              trailing={
                <Text style={styles.eyebrow}>{persona.eyebrow}</Text>
              }
            />
          ))}
        </Surface>

        <Text style={styles.trustLine}>
          Secured activation · Role-based access · Verification before operations
        </Text>

        <OperationalButton
          intent="utility"
          label="Already activated? Sign in"
          onPress={() => router.push(ROUTES.SIGN_IN)}
          fullWidth
          style={styles.signIn}
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
  eyebrow: {
    ...typography.label,
    fontSize: 9,
    color: colors.textMuted,
    maxWidth: 72,
    textAlign: 'right',
  },
  trustLine: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: space[5],
    marginBottom: space[4],
    color: colors.textMuted,
  },
  signIn: {
    marginTop: space[2],
  },
});
