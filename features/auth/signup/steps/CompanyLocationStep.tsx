import { Platform, StyleSheet, Text, View } from 'react-native';

import {
  OnboardingFocusedField,
  OnboardingFullPageFormStep,
} from '@/features/onboarding';
import { CityPicker } from '../components/CityPicker';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';

export function CompanyLocationStep({ flow }: { flow: SignUpFlow }) {
  return (
    <OnboardingFullPageFormStep
      title="Operational base"
      subtitle={`Primary office location for ${flow.orgName}.`}
      eyebrow="Location"
      primaryLabel="Continue"
      onPrimary={flow.continueCompanyLocation}
    >
      <OnboardingFocusedField
        label="Office address"
        value={flow.addressLine}
        onChangeText={flow.setAddressLine}
        placeholder="Building, street, area"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        autoCapitalize="sentences"
      />

      <View style={styles.cityGroup}>
        <Text style={styles.cityLabel}>
          City / district <Text style={styles.req}>*</Text>
        </Text>
        <CityPicker
          value={flow.selectedLocation}
          onChange={flow.setSelectedLocation}
          attempted={flow.step4Attempted}
          error={flow.step4Errors.city}
        />
      </View>
    </OnboardingFullPageFormStep>
  );
}

const styles = StyleSheet.create({
  cityGroup: {
    marginTop: space[2],
  },
  cityLabel: {
    ...typography.label,
    fontSize: 10,
    marginBottom: space[2],
    color: colors.textSecondary,
  },
  req: {
    color: colors.cost,
  },
});
