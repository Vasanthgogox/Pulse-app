import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';

import Theme from '@/constants/Theme';
import type { SignUpFlow } from '@/features/auth/signup/hooks/useBusinessSignUpFlow';
import { SignUpPulseFormStep } from '@/features/auth/signup/SignUpPulseFormStep';
import { ROUTES } from '@/lib/routes';
import { useRouter } from 'expo-router';

/**
 * Team join path after OTP: verified identity but no matching invitation (limited access).
 */
export function InviteNotFoundStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  const displayPhone = flow.phone.replace(/\D/g, '').slice(-10);

  return (
    <SignUpPulseFormStep
      title="Limited access"
      subtitle="Your number is verified, but we could not match a pending team invitation. You cannot join a workspace until an admin invites you."
      primaryLabel="Try a different number"
      onPrimary={() => flow.goToPage(0)}
      footerAccessory={
        <>
          <Pressable onPress={flow.requestNewInvitation} style={styles.secondary}>
            <Text style={styles.secondaryText}>Ask admin to send an invite</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace(ROUTES.SIGN_IN)}
            style={styles.link}
          >
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <ShieldAlert size={28} color={Theme.warning} strokeWidth={2} />
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>VERIFIED NUMBER</Text>
          <Text style={styles.badgeValue}>+91 {displayPhone}</Text>
        </View>
      </View>

      <View style={styles.box}>
        <Text style={styles.sectionTitle}>What you can do</Text>
        <Text style={styles.bullet}>• Ask your company admin to invite this mobile number</Text>
        <Text style={styles.bullet}>• Sign in if you were invited by email on an existing account</Text>
        <Text style={styles.bullet}>• Try again with the number your admin used on the invite</Text>
      </View>

      <View style={styles.boxMuted}>
        <Text style={styles.sectionTitle}>Why limited access?</Text>
        <Text style={styles.hint}>
          Team invitations are matched to your verified phone or email. Without a pending invite,
          Pulse cannot create a membership or open a company workspace for this number.
        </Text>
      </View>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 14,
    marginBottom: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignItems: 'center',
    gap: 4,
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Theme.textMuted,
  },
  badgeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  box: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    backgroundColor: Theme.cardWhite,
  },
  boxMuted: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    backgroundColor: Theme.surfaceGray,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  bullet: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
  },
  hint: {
    fontSize: 12,
    color: Theme.textMuted,
    lineHeight: 17,
  },
  secondary: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: Theme.buttonPrimaryRadius,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: Theme.cardWhite,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { fontSize: 13, fontWeight: '600', color: Theme.primary },
});
