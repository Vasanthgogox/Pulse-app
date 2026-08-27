import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { SIGNUP_TEXT } from "@/features/auth/signup/signUpTypography";
import type { SignUpFlow } from "@/features/auth/signup/hooks/useBusinessSignUpFlow";
import { SignUpPulseField } from "@/features/auth/signup/SignUpPulseField";
import { SignUpPulseFormStep } from "@/features/auth/signup/SignUpPulseFormStep";
import { SIGNUP_ACCOUNT_MOBILE_SCROLL_PAD, SIGNUP_ACCOUNT_SCROLL_PAD } from "@/features/auth/signup/signUpConstants";
import { Eye, EyeOff } from "lucide-react-native";

export function InviteExistingAccountStep({ flow }: { flow: SignUpFlow }) {
  const invite = flow.selectedInvite;
  const orgName = invite?.organizationName ?? 'your workspace';
  const roleLabel = invite?.platformRoleLabel;

  const masked = flow.inviteEmailMasked;
  const canSignIn =
    !!(flow.email.trim() || flow.onboardingContext?.existingAccountEmail) &&
    flow.password.length >= 6 &&
    !flow.loading;

  return (
    <SignUpPulseFormStep
      title="Account already exists"
      subtitle="Sign in to accept your team invitation. Your workspace will load automatically — no second signup."
      primaryLabel="Sign in & accept invite"
      onPrimary={flow.signInToAcceptInvitation}
      primaryDisabled={!canSignIn}
      primaryLoading={flow.loading}
      inlinePrimary={flow.isDesktop}
      keyboardAware
      scrollRef={flow.accountScrollRef}
      scrollPaddingBottom={
        flow.isDesktop ? SIGNUP_ACCOUNT_SCROLL_PAD : SIGNUP_ACCOUNT_MOBILE_SCROLL_PAD
      }
      footerAccessory={
        <>
          <Pressable onPress={flow.useAlternateEmailForInvite} style={styles.secondary}>
            <Text style={styles.secondaryText}>Use a different email instead</Text>
          </Pressable>
          <Pressable onPress={flow.startOwnerOnboarding} style={styles.link}>
            <Text style={styles.linkText}>Create my own workspace</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.summary}>
        {invite ? (
          <>
            <SummaryRow label="Organization" value={invite.organizationName} />
            <SummaryRow label="Invited by" value={invite.invitedByName} />
            {roleLabel ? <SummaryRow label="Role" value={roleLabel} /> : null}
          </>
        ) : (
          <SummaryRow label="Workspace" value={orgName} />
        )}
        {masked ? <SummaryRow label="Registered as" value={masked} /> : null}
      </View>

      <View style={styles.warnBox}>
        <Text style={styles.warnTitle}>Wrong signup path</Text>
        <Text style={styles.warnBody}>
          Team invites for existing users require sign-in. If this is not your account,
          use a different email or ask your admin to re-invite the correct person.
        </Text>
      </View>

      <SignUpPulseField
        label="Email Address"
        required
        value={flow.email}
        onChangeText={flow.setEmail}
        placeholder={flow.onboardingContext?.existingAccountEmail ?? 'you@example.com'}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        editable={!flow.loading}
        errorMessage={flow.inviteAccountAttempted ? flow.step5Errors.email : null}
      />
      <SignUpPulseField
        label="Password"
        required
        dense
        value={flow.password}
        onChangeText={flow.setPassword}
        placeholder="Your existing password"
        secureTextEntry={!flow.showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="password"
        textContentType="password"
        maxLength={128}
        editable={!flow.loading}
        errorMessage={flow.inviteAccountAttempted ? flow.step5Errors.password : null}
        trailing={
          <Pressable
            onPress={flow.toggleShowPassword}
            hitSlop={8}
            focusable={false}
            accessibilityRole="button"
            accessibilityLabel={flow.showPassword ? 'Hide password' : 'Show password'}
          >
            {flow.showPassword ? (
              <EyeOff size={18} color={Theme.textMuted} />
            ) : (
              <Eye size={18} color={Theme.textMuted} />
            )}
          </Pressable>
        }
      />
    </SignUpPulseFormStep>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 8,
    backgroundColor: Theme.surfaceGray,
  },
  warnBox: {
    borderWidth: 1,
    borderColor: Theme.warningMuted,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: Theme.warningMuted,
    gap: 4,
  },
  warnTitle: {
    ...SIGNUP_TEXT.fieldLabel,
    color: Theme.warning,
    fontWeight: '800',
  },
  warnBody: {
    ...SIGNUP_TEXT.caption,
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    ...SIGNUP_TEXT.caption,
    flex: 1,
  },
  value: {
    ...SIGNUP_TEXT.captionMedium,
    color: Theme.textPrimaryDark,
    flex: 1.2,
    textAlign: "right",
  },
  secondary: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: Theme.buttonPrimaryRadius,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
  },
  secondaryText: {
    ...SIGNUP_TEXT.link,
    color: Theme.textPrimaryDark,
  },
  link: { marginTop: 14, alignItems: "center" },
  linkText: { ...SIGNUP_TEXT.link },
});
