import { MapPin } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { LocationSearchField } from '@/features/trips/components/add-trip/LocationSearchField';
import Theme from '@/constants/Theme';
import { VALIDATION } from '@/lib/validation';

import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { CityPicker } from '../components/CityPicker';
import { SignUpPulseField } from '../SignUpPulseField';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { SignUpPulseSubtitle } from '../SignUpPulseSubtitle';
import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS } from '../signUpPulseTheme';
import { SIGNUP_TEXT } from '../signUpTypography';

export function CompanyLocationStep({ flow }: { flow: SignUpFlow }) {
  const showStreetError = flow.step4Attempted ? flow.step4Errors.street : null;
  const showLocalityError = flow.step4Attempted ? flow.step4Errors.locality : null;
  const showPincodeError = flow.step4Attempted ? flow.step4Errors.pincode : null;
  const hasPinnedCoords =
    flow.officeLatitude != null &&
    flow.officeLongitude != null &&
    (flow.officeLatitude !== 0 || flow.officeLongitude !== 0);

  return (
    <SignUpPulseFormStep
      title="Office location"
      subtitle={
        <SignUpPulseSubtitle beforeHighlight="Where is " highlight={flow.orgName} afterHighlight=" based?" />
      }
      primaryLabel="Continue"
      onPrimary={flow.continueCompanyLocation}
      primaryDisabled={!flow.step4Valid}
      keyboardAware
      scrollRef={flow.locationScrollRef}
    >
      <View style={styles.locationFieldWrap}>
        <LocationSearchField
          label="Area / locality on map"
          placeholder="Search area, landmark, or neighbourhood"
          value={flow.officePlaceLabel}
          onChangeText={(text) => {
            flow.setOfficePlaceLabel(text);
            if (!text.trim()) flow.clearOfficePlace();
          }}
          onSelectPlace={(name, coords) => {
            void flow.applyOfficePlaceFromMap(name, coords.lat, coords.lon, {
              pincode: coords.pincode,
              city: coords.city,
              state: coords.state,
            });
          }}
          leadingIcon={<MapPin size={14} color={PULSE_SIGNUP.primaryDark} strokeWidth={2} />}
          inputStyle={styles.locationInput}
          labelStyle={SIGNUP_TEXT.fieldLabel}
          compact
          sheetVariant="signup"
        />
        {flow.officePlaceResolving ? (
          <View style={styles.hintRow}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={SIGNUP_TEXT.captionMedium}>Filling city, state & PIN…</Text>
          </View>
        ) : hasPinnedCoords ? (
          <Text style={SIGNUP_TEXT.caption}>
            City, state & PIN filled from map — enter door no. and area below
          </Text>
        ) : null}
      </View>

      <SignUpPulseField
        label="Door / building & street"
        required
        value={flow.streetAddress}
        onChangeText={flow.setStreetAddress}
        placeholder="e.g. 12A, Gogox Towers, Old Gingee Road"
        autoCapitalize="words"
        errorMessage={showStreetError}
        dense
      />

      <SignUpPulseField
        label="Area / locality"
        value={flow.locality}
        onChangeText={flow.setLocality}
        placeholder="e.g. Near bus stand, colony or landmark"
        autoCapitalize="words"
        errorMessage={showLocalityError}
        dense
      />

      <SignUpPulseField
        label="PIN Code"
        required
        value={flow.pincode}
        onChangeText={(text) => flow.setPincode(text.replace(/\D/g, '').slice(0, VALIDATION.PINCODE_LENGTH))}
        placeholder="e.g. 400001"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={VALIDATION.PINCODE_LENGTH}
        errorMessage={showPincodeError}
        dense
      />

      <Text style={SIGNUP_TEXT.fieldLabel}>
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
  locationFieldWrap: {
    marginBottom: 10,
  },
  locationInput: {
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    borderRadius: PULSE_SIGNUP_RADIUS.input,
    backgroundColor: PULSE_SIGNUP.bg,
    minHeight: 48,
    paddingVertical: 12,
    color: PULSE_SIGNUP.text,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  req: {
    color: '#ef4444',
  },
});
