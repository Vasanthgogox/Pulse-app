import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { SIGNUP_TEXT } from "@/features/auth/signup/signUpTypography";
import type { SignUpFlow } from "@/features/auth/signup/hooks/useBusinessSignUpFlow";
import { SignUpPulseField } from "@/features/auth/signup/SignUpPulseField";
import { SignUpPulseFormStep } from "@/features/auth/signup/SignUpPulseFormStep";
import { SIGNUP_ACCOUNT_MOBILE_SCROLL_PAD, SIGNUP_ACCOUNT_SCROLL_PAD } from "@/features/auth/signup/signUpConstants";
import { Eye, EyeOff } from "lucide-react-native";

export function InviteAcceptanceStep({ flow }: { flow: SignUpFlow }) {
  const invite = flow.selectedInvite;
  if (!invite) return null;

  const canAccept =
    !!flow.fullName.trim() &&
    !!flow.email.trim() &&
    flow.password.length >= 6 &&
    flow.password === flow.confirmPassword &&
    !flow.loading;

  return (
    <SignUpPulseFormStep
      title="Join your team"
      subtitle="Accept the invitation and create your account. No new workspace will be created."
      primaryLabel="Accept invitation"
      onPrimary={flow.acceptTeamInvitation}
      primaryDisabled={!canAccept}
      primaryLoading={flow.loading}
      inlinePrimary={flow.isDesktop}
      keyboardAware
      scrollRef={flow.accountScrollRef}
      scrollPaddingBottom={
        flow.isDesktop ? SIGNUP_ACCOUNT_SCROLL_PAD : SIGNUP_ACCOUNT_MOBILE_SCROLL_PAD
      }
    >
      <View style={styles.summary}>
        <SummaryRow label="Organization" value={invite.organizationName} />
        <SummaryRow label="Invited by" value={invite.invitedByName} />
        <SummaryRow label="Role" value={invite.platformRoleLabel} />
        {invite.businessUnitName ? (
          <SummaryRow label="Business unit" value={invite.businessUnitName} />
        ) : null}
        {invite.departmentName ? (
          <SummaryRow label="Department" value={invite.departmentName} />
        ) : null}
        <SummaryRow label="Invitation" value={flow.formatInviteAge(invite.createdAt)} />
      </View>

      <SignUpPulseField
        label="Full Name"
        required
        value={flow.fullName}
        onChangeText={flow.setFullName}
        placeholder="Your name"
        autoCapitalize="words"
        editable={!flow.loading}
        errorMessage={flow.inviteAccountAttempted ? flow.step5Errors.fullName : null}
      />
      <SignUpPulseField
        label="Email Address"
        required
        value={flow.email}
        onChangeText={flow.setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!flow.loading}
        errorMessage={flow.inviteAccountAttempted ? flow.step5Errors.email : null}
      />
      <SignUpPulseField
        label="Password"
        required
        value={flow.password}
        onChangeText={flow.setPassword}
        placeholder="At least 6 characters"
        secureTextEntry={!flow.showPassword}
        editable={!flow.loading}
        errorMessage={flow.inviteAccountAttempted ? flow.step5Errors.password : null}
        trailing={
          <Pressable onPress={flow.toggleShowPassword} hitSlop={8}>
            {flow.showPassword ? (
              <EyeOff size={18} color={Theme.textMuted} />
            ) : (
              <Eye size={18} color={Theme.textMuted} />
            )}
          </Pressable>
        }
      />
      <SignUpPulseField
        label="Confirm Password"
        required
        value={flow.confirmPassword}
        onChangeText={flow.setConfirmPassword}
        placeholder="Repeat password"
        secureTextEntry={!flow.showConfirmPassword}
        editable={!flow.loading}
        errorMessage={flow.inviteAccountAttempted ? flow.step5Errors.confirmPassword : null}
        trailing={
          <Pressable onPress={flow.toggleShowConfirmPassword} hitSlop={8}>
            {flow.showConfirmPassword ? (
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
});
