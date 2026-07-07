import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import {
  PULSE_PILL_BUTTON_BORDER_WIDTH,
  PULSE_PILL_BUTTON_RADIUS,
  pulsePillButtonLabelCompact,
  pulsePillButtonPressed,
} from '@/constants/PulsePillButtonChrome';
import Theme from '@/constants/Theme';
import type { SignUpFlow } from '@/features/auth/signup/hooks/useBusinessSignUpFlow';
import { SignUpPulseFormStep } from '@/features/auth/signup/SignUpPulseFormStep';
import { PULSE_SIGNUP } from '@/features/auth/signup/signUpPulseTheme';
import { SIGNUP_TEXT } from '@/features/auth/signup/signUpTypography';
import { ROUTES } from '@/lib/routes';

/**
 * Team join path after OTP: verified identity but no matching invitation (limited access).
 */
export function InviteNotFoundStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  const displayPhone = flow.phone.replace(/\D/g, '').slice(-10);

  return (
    <SignUpPulseFormStep
      title="Limited access"
      subtitle="Your number is verified, but we could not match a pending team invitation."
      primaryLabel=""
      onPrimary={() => {}}
      customFooter={
        <View style={styles.footer}>
          <View style={styles.btnRow}>
            <Pressable
              onPress={flow.requestNewInvitation}
              style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && pulsePillButtonPressed]}
            >
              <Text style={[pulsePillButtonLabelCompact, styles.btnLabelOutline]} numberOfLines={2}>
                Ask admin for invite
              </Text>
            </Pressable>
            <Pressable
              onPress={() => flow.goToPage(0)}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && pulsePillButtonPressed]}
            >
              <Text style={[pulsePillButtonLabelCompact, styles.btnLabelPrimary]} numberOfLines={2}>
                Different number
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => router.replace(ROUTES.SIGN_IN)}
            hitSlop={8}
            style={styles.signInLink}
          >
            <Text style={SIGNUP_TEXT.linkSmall}>
              Already have an account? <Text style={SIGNUP_TEXT.linkEmphasis}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <ShieldAlert size={22} color={Theme.warning} strokeWidth={2} />
        </View>
        <View style={styles.badge}>
          <Text style={SIGNUP_TEXT.fieldLabel}>Verified number</Text>
          <Text style={styles.phone}>+91 {displayPhone}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What you can do</Text>
        <Text style={styles.bullet}>Ask your admin to invite this mobile number</Text>
        <Text style={styles.bullet}>Sign in if you were invited by email on an existing account</Text>
        <Text style={styles.bullet}>Try again with the number your admin used on the invite</Text>
      </View>

      <View style={styles.cardMuted}>
        <Text style={styles.cardTitle}>Why limited access?</Text>
        <Text style={styles.hint}>
          Team invitations match your verified phone or email. Without a pending invite, Pulse
          cannot open a company workspace for this number.
        </Text>
      </View>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignItems: 'center',
    gap: 2,
  },
  phone: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: PULSE_SIGNUP.text,
    letterSpacing: 0.3,
  },
  card: {
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: PULSE_SIGNUP.bg,
    marginBottom: 8,
  },
  cardMuted: {
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: PULSE_SIGNUP.surface,
    marginBottom: 4,
  },
  cardTitle: {
    ...SIGNUP_TEXT.captionMedium,
    color: PULSE_SIGNUP.text,
    fontWeight: '600',
  },
  bullet: {
    ...SIGNUP_TEXT.caption,
    paddingLeft: 2,
  },
  hint: {
    ...SIGNUP_TEXT.caption,
    lineHeight: 16,
  },
  footer: {
    gap: 10,
    width: '100%',
  },
  signInLink: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  btn: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: PULSE_PILL_BUTTON_RADIUS,
    borderWidth: PULSE_PILL_BUTTON_BORDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {
    backgroundColor: PULSE_SIGNUP.bg,
    borderColor: PULSE_SIGNUP.border,
  },
  btnPrimary: {
    backgroundColor: PULSE_SIGNUP.primary,
    borderColor: PULSE_SIGNUP.primaryDark,
  },
  btnLabelOutline: {
    color: PULSE_SIGNUP.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  btnLabelPrimary: {
    color: Theme.buttonPrimaryText,
    textAlign: 'center',
    fontWeight: '600',
  },
});
