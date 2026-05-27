import { StyleSheet, Text } from 'react-native';

import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { CityPicker } from '../components/CityPicker';
import { SignUpPulseField } from '../SignUpPulseField';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

export function CompanyLocationStep({ flow }: { flow: SignUpFlow }) {
  return (
    <SignUpPulseFormStep
      title="Office location"
      subtitle={
        <Text style={styles.subtitle}>
          Where is <Text style={styles.orgHighlight}>{flow.orgName}</Text> based?
        </Text>
      }
      primaryLabel="Continue"
      onPrimary={flow.continueCompanyLocation}
      primaryDisabled={!flow.selectedLocation}
    >
      <SignUpPulseField
        label="Office Address"
        value={flow.addressLine}
        onChangeText={flow.setAddressLine}
        placeholder="Building, street, area"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        autoCapitalize="sentences"
      />

      <Text style={styles.cityLabel}>
        City / District <Text style={styles.req}>*</Text>
      </Text>
      <CityPicker
        value={flow.selectedLocation}
        onChange={flow.setSelectedLocation}
        attempted={flow.step4Attempted}
        error={flow.step4Errors.city}
      />
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: PULSE_SIGNUP.muted,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
  },
  orgHighlight: {
    fontWeight: '900',
    color: PULSE_SIGNUP.primary,
  },
  cityLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: PULSE_SIGNUP.muted,
    marginBottom: 8,
    paddingLeft: 4,
  },
  req: {
    color: '#ef4444',
  },
});
