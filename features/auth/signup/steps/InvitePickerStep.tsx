import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { PULSE_SIGNUP_TYPO, SIGNUP_TEXT } from "@/features/auth/signup/signUpTypography";
import type { SignUpFlow } from "@/features/auth/signup/hooks/useBusinessSignUpFlow";
import { SignUpPulseFormStep } from "@/features/auth/signup/SignUpPulseFormStep";
import { Check } from "lucide-react-native";

export function InvitePickerStep({ flow }: { flow: SignUpFlow }) {
  const invites = flow.resolvedInvites?.active ?? [];

  return (
    <SignUpPulseFormStep
      title="Choose workspace"
      subtitle="You have multiple team invitations. Select which organization to join."
      primaryLabel="Continue"
      onPrimary={flow.continueInvitePicker}
      primaryDisabled={!flow.selectedInviteId}
    >
      <View style={styles.list}>
        {invites.map((invite) => {
          const selected = flow.selectedInviteId === invite.inviteId;
          return (
            <Pressable
              key={invite.inviteId}
              onPress={() => flow.selectInvite(invite.inviteId)}
              style={[styles.card, selected && styles.cardSelected]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.orgName}>{invite.organizationName}</Text>
                {selected ? (
                  <Check size={16} color={Theme.primary} strokeWidth={2.5} />
                ) : null}
              </View>
              <Text style={styles.meta}>
                Role: {invite.platformRoleLabel} · Invited by {invite.invitedByName}
              </Text>
              <Text style={styles.meta}>{flow.formatInviteAge(invite.createdAt)}</Text>
            </Pressable>
          );
        })}
      </View>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    padding: 14,
    backgroundColor: Theme.cardWhite,
  },
  cardSelected: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.04)",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orgName: {
    ...PULSE_SIGNUP_TYPO.bodyMedium,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    flex: 1,
  },
  meta: {
    ...SIGNUP_TEXT.caption,
    marginTop: 3,
  },
});
