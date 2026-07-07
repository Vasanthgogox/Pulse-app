import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StyleSheet, Text, View } from 'react-native';

import { LoadingIndicator } from '@/components/LoadingIndicator';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseField } from '../SignUpPulseField';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { PULSE_SIGNUP } from '../signUpPulseTheme';
import { PULSE_SIGNUP_TYPO, SIGNUP_TEXT } from '../signUpTypography';

export function OrgStep({ flow }: { flow: SignUpFlow }) {
  const orgError =
    (flow.step2Attempted && !flow.orgName.trim() ? 'Enter your organization name.' : null) ??
    flow.orgTakenError ??
    null;

  const hint =
    flow.orgCheck?.loading
      ? 'Checking availability…'
      : flow.orgCheck?.taken
        ? 'This name is already registered.'
        : flow.orgCheck && !flow.orgCheck.taken && flow.orgName.trim()
          ? 'Available! You will create this organization.'
          : null;

  return (
    <SignUpPulseFormStep
      title="Your organization"
      subtitle="Enter your company name. We'll check if it already exists on Pulse."
      primaryLabel="Continue"
      onPrimary={flow.continueOrgCheck}
      primaryDisabled={
        !flow.orgName.trim() ||
        !!flow.orgCheck?.loading ||
        !!flow.orgCheck?.taken ||
        flow.loading
      }
      primaryLoading={flow.loading || !!flow.orgCheck?.loading}
      keyboardAware
    >
      <SignUpPulseField
        label="Company / Organization Name"
        required
        value={flow.orgName}
        onChangeText={flow.setOrgName}
        placeholder="e.g. Acme Logistics"
        autoCapitalize="words"
        autoFocus
        errorMessage={orgError}
        hintMessage={hint}
      />

      {flow.orgCheck?.loading ? (
        <View style={stylesStatus.row}>
          <LoadingIndicator size="small" color={PULSE_SIGNUP.muted} />
          <Text style={SIGNUP_TEXT.captionMedium}>Checking availability…</Text>
        </View>
      ) : flow.orgCheck?.taken ? (
        <View style={stylesStatus.banner}>
          <FontAwesome name="exclamation-triangle" size={14} color="#d97706" />
          <View style={stylesStatus.bannerBody}>
            <Text style={stylesStatus.bannerTitle}>Workspace already exists</Text>
            <Text style={stylesStatus.bannerSub}>
              Ask your administrator for a team invite — you cannot provision a duplicate operator
              with this name.
            </Text>
          </View>
        </View>
      ) : null}
    </SignUpPulseFormStep>
  );
}

const stylesStatus = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -8,
    marginBottom: 16,
  },
  hint: SIGNUP_TEXT.captionMedium,
  banner: {
    flexDirection: 'row',
    gap: 12,
    marginTop: -8,
    marginBottom: 16,
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
    padding: 14,
  },
  bannerBody: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    ...PULSE_SIGNUP_TYPO.bannerTitle,
    color: '#92400e',
    marginBottom: 4,
  },
  bannerSub: {
    ...PULSE_SIGNUP_TYPO.bannerBody,
    color: '#78350f',
  },
});
