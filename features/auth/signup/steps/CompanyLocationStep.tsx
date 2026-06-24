import { StyleSheet, Text } from 'react-native';

import { VALIDATION } from '@/lib/validation';

import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { CityPicker } from '../components/CityPicker';
import { SignUpPulseField } from '../SignUpPulseField';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

export function CompanyLocationStep({ flow }: { flow: SignUpFlow }) {
  const showStreetError = flow.step4Attempted ? flow.step4Errors.street : null;
  const showLocalityError = flow.step4Attempted ? flow.step4Errors.locality : null;
  const showPincodeError = flow.step4Attempted ? flow.step4Errors.pincode : null;

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
      primaryDisabled={!flow.step4Valid}
      keyboardAware
      scrollRef={flow.locationScrollRef}
    >
      <SignUpPulseField
        label="Building / Street"
        required
        value={flow.streetAddress}
        onChangeText={flow.setStreetAddress}
        placeholder="e.g. Old Gingee Road"
        autoCapitalize="words"
        autoFocus
        errorMessage={showStreetError}
        dense
      />

      <SignUpPulseField
        label="Area / Locality"
        value={flow.locality}
        onChangeText={flow.setLocality}
        placeholder="e.g. Near bus stand"
        autoCapitalize="words"
        errorMessage={showLocalityError}
        dense
      />

      <SignUpPulseField
        label="PIN Code"
        required
        value={flow.pincode}
        onChangeText={(text) => flow.setPincode(text.replace(/\D/g, '').slice(0, VALIDATION.PINCODE_LENGTH))}
        placeholder="605602"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={VALIDATION.PINCODE_LENGTH}
        errorMessage={showPincodeError}
        onFocus={flow.scrollLocationFieldIntoView}
        dense
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
