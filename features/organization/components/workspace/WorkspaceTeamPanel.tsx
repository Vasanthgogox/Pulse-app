import Theme from "@/constants/Theme";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { TeamMembersView } from "@/features/organization/components/TeamMembersView";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { WORKSPACE_PANEL_TITLES } from "@/features/organization/components/workspace/workspacePanelTypes";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { UserPlus2, Users } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
type Props = {
  onBack: () => void;
};

export function WorkspaceTeamPanel({ onBack }: Props) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { currentOrganization } = useOrganization();

  const orgId = currentOrganization?.id ?? null;
  const canManage = profile?.role !== "driver";

  const handleInvite = () => {
    router.push(ROUTES.MODALS.INVITE_MEMBER as Parameters<typeof router.push>[0]);
  };

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.team}
      subtitle={currentOrganization?.name ?? "Organisation"}
      onBack={onBack}
      fillBody
      rightSlot={
        canManage ? (
          <Pressable
            onPress={handleInvite}
            style={({ pressed }) => [styles.inviteBtn, pressed && { opacity: 0.85 }]}
          >
            <UserPlus2 size={16} color={Theme.textOnPrimary} strokeWidth={2.4} />
            <Text style={styles.inviteBtnText}>Invite</Text>
          </Pressable>
        ) : (
          <View style={styles.invitePlaceholder} />
        )
      }
    >
      {!orgId ? (
        <View style={styles.centered}>
          <Users size={36} color={Theme.textSection} strokeWidth={1.5} />
          <Text style={styles.noOrgText}>No organization loaded</Text>
        </View>
      ) : (
        <TeamMembersView
          orgId={orgId}
          currentUserId={user?.uid ?? null}
          canManage={canManage}
          onInvite={canManage ? handleInvite : undefined}
        />
      )}
    </WorkspaceDetailLayout>
  );
}

const styles = StyleSheet.create({
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  inviteBtnText: { fontSize: 12, fontWeight: "700", color: Theme.buttonPrimaryText },
  invitePlaceholder: { width: 72 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  noOrgText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textSecondary,
    marginTop: 8,
  },
});
