import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import type { SignUpFlow } from "@/features/auth/signup/hooks/useBusinessSignUpFlow";
import { SignUpPulseFormStep } from "@/features/auth/signup/SignUpPulseFormStep";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";

export function InviteExpiredStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  const expired = flow.resolvedInvites?.expired ?? [];

  return (
    <SignUpPulseFormStep
      title="Invitation expired"
      subtitle="Your team invitation is no longer valid. Ask your admin to send a new one, or create your own workspace."
      primaryLabel="Create my own workspace"
      onPrimary={flow.startOwnerOnboarding}
      footerAccessory={
        <>
          <Pressable onPress={flow.requestNewInvitation} style={styles.secondary}>
            <Text style={styles.secondaryText}>Request new invitation</Text>
          </Pressable>
          <Pressable onPress={() => router.replace(ROUTES.SIGN_IN)} style={styles.link}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.box}>
        {expired.slice(0, 3).map((invite) => (
          <View key={invite.inviteId} style={styles.item}>
            <Text style={styles.org}>{invite.organizationName}</Text>
            <Text style={styles.meta}>
              Expired · was invited as {invite.platformRoleLabel}
            </Text>
          </View>
        ))}
      </View>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: Theme.surfaceGray,
  },
  item: { gap: 2 },
  org: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  meta: { fontSize: 12, color: Theme.textMuted },
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
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  link: { marginTop: 16, alignItems: "center" },
  linkText: { fontSize: 13, fontWeight: "600", color: Theme.primary },
});
