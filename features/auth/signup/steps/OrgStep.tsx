import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StyleSheet, Text, View } from 'react-native';

import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Surface } from '@/components/operational';
import {
  OnboardingFocusedField,
  OnboardingFullPageFormStep,
} from '@/features/onboarding';
import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';
import { C } from '../businessSignUp.styles';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';

export function OrgStep({ flow }: { flow: SignUpFlow }) {
  const orgError =
    (flow.step2Attempted && !flow.orgName.trim()
      ? 'Enter your organization name.'
      : null) ??
    flow.orgTakenError ??
    null;

  const availability = flow.orgCheck?.loading ? (
    <View style={stylesStatus.row}>
      <LoadingIndicator size="small" color={C.muted} />
      <Text style={stylesStatus.hint}>Checking availability…</Text>
    </View>
  ) : flow.orgCheck?.taken ? (
    <Surface elevation={0} density="medium" style={stylesStatus.banner}>
      <FontAwesome name="exclamation-triangle" size={14} color={colors.pending} />
      <View style={stylesStatus.bannerBody}>
        <Text style={stylesStatus.bannerTitle}>Workspace already exists</Text>
        <Text style={stylesStatus.bannerSub}>
          Ask your administrator for a team invite — you cannot provision a duplicate
          operator with this name.
        </Text>
      </View>
    </Surface>
  ) : flow.orgCheck && !flow.orgCheck.taken && flow.orgName.trim() ? (
    <Text style={stylesStatus.ok}>Available — workspace will be provisioned</Text>
  ) : null;

  if (flow.useMobileLayout) {
    return (
      <OnboardingFullPageFormStep
        title="Name your workspace"
        subtitle="This becomes your operator identity on the Pulse network."
        eyebrow="Workspace"
        primaryLabel="Check availability"
        onPrimary={flow.continueOrgCheck}
        primaryDisabled={
          !flow.orgName.trim() ||
          !!flow.orgCheck?.loading ||
          !!flow.orgCheck?.taken ||
          flow.loading
        }
        primaryLoading={flow.loading || !!flow.orgCheck?.loading}
      >
        <OnboardingFocusedField
          label="Company / organization name"
          value={flow.orgName}
          onChangeText={flow.setOrgName}
          errorMessage={orgError}
          hintMessage={
            flow.orgCheck?.loading
              ? 'Checking availability…'
              : flow.orgCheck?.taken
                ? 'This name is already registered.'
                : flow.orgCheck && !flow.orgCheck.taken && flow.orgName.trim()
                  ? 'Available — workspace will be provisioned.'
                  : null
          }
          placeholder="e.g. GoGoX Logistics"
          autoCapitalize="words"
          autoFocus
        />
        {availability}
      </OnboardingFullPageFormStep>
    );
  }

  return (
    <OnboardingFullPageFormStep
      title="Name your workspace"
      subtitle="This becomes your operator identity on the Pulse network."
      eyebrow="Workspace"
      primaryLabel="Continue provisioning"
      onPrimary={flow.continueOrgCheck}
      primaryDisabled={
        !flow.orgName.trim() ||
        !!flow.orgCheck?.loading ||
        !!flow.orgCheck?.taken ||
        flow.loading
      }
      primaryLoading={flow.loading || !!flow.orgCheck?.loading}
    >
      <OnboardingFocusedField
        label="Company / organization name"
        value={flow.orgName}
        onChangeText={flow.setOrgName}
        autoCapitalize="words"
        placeholder="e.g. GoGoX Logistics"
        errorMessage={
          flow.step2Attempted && !flow.orgName.trim()
            ? 'Enter your organization name.'
            : flow.orgTakenError
        }
      />
      {availability}
    </OnboardingFullPageFormStep>
  );
}

const stylesStatus = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginTop: space[2],
  },
  hint: {
    ...typography.caption,
  },
  banner: {
    flexDirection: 'row',
    gap: space[3],
    marginTop: space[3],
    backgroundColor: '#fffbeb',
  },
  bannerBody: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 4,
  },
  bannerSub: {
    fontSize: 12,
    lineHeight: 18,
    color: '#78350f',
  },
  ok: {
    fontSize: 13,
    color: colors.revenue,
    fontWeight: '600',
    marginTop: space[3],
  },
});
