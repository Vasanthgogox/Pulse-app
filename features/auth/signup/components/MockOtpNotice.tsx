import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StyleSheet, Text, View } from 'react-native';

import { PULSE_SIGNUP_TYPO } from '../signUpTypography';

/**
 * Business sign-up OTP step: mock verification is intentional in all environments.
 */
export function MockOtpNotice() {
  return (
    <View
      style={styles.shell}
      accessibilityRole="text"
      accessibilityLabel="Mock verification. No SMS is sent. Enter any six digit code."
    >
      <FontAwesome name="flask" size={10} color={Theme.actionAccentBorder} />
      <Text style={styles.text}>
        <Text style={styles.label}>Mock · </Text>
        No SMS — enter any <Text style={styles.emphasis}>6-digit code</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148, 163, 184, 0.45)',
  },
  text: {
    flex: 1,
    minWidth: 0,
    ...PULSE_SIGNUP_TYPO.pillSub,
    lineHeight: 15,
    color: Theme.textRouteCard,
  },
  label: {
    ...PULSE_SIGNUP_TYPO.label,
    fontSize: 9,
    color: Theme.actionAccentBorder,
  },
  emphasis: {
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
});
