/**
 * Team tab — org members & invites (moved from workspace).
 */
import Theme from "@/constants/Theme";
import { InviteMemberFlow } from "@/features/organization/components/InviteMemberModal";
import { TeamMembersView } from "@/features/organization/components/TeamMembersView";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import { useInvalidateOrgMembers } from "@/lib/queries/useOrgMembersQuery";
import { UserPlus2, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

type Props = {
  orgId: string;
  orgName: string;
  currentUserId: string | null;
  canManage: boolean;
};

export function NetworkDesktopTeamPanel({
  orgId,
  orgName,
  currentUserId,
  canManage,
}: Props) {
  const layout = useProfileHubCompactLayout();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [focusPending, setFocusPending] = useState(false);
  const invalidate = useInvalidateOrgMembers(orgId);

  const openInvite = () => {
    setFocusPending(false);
    setInviteOpen(true);
  };
  const closeInvite = () => setInviteOpen(false);

  const handleInvited = () => {
    invalidate();
    setFocusPending(true);
    setInviteOpen(false);
  };

  return (
    <View style={[styles.panel, layout.panel]}>
      <View style={[styles.sectionToolbar, layout.sectionToolbar]}>
        <View style={styles.teamPanelTitleCol}>
          <Text style={[styles.sectionTitle, layout.sectionTitle]}>Team members</Text>
          <Text style={[styles.sectionSub, layout.sectionSub]}>
            {inviteOpen
              ? "Find a colleague by phone and choose their role"
              : `Manage who can access ${orgName || "your organization"}`}
          </Text>
        </View>
        {canManage ? (
          inviteOpen ? (
            <Pressable
              onPress={closeInvite}
              style={({ pressed }) => [
                styles.teamInviteCancelBtn,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Cancel invite"
            >
              <X size={15} color={METRONIC.text} strokeWidth={2.3} />
              <Text style={styles.teamInviteCancelBtnText}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={openInvite}
              style={({ pressed }) => [
                styles.teamInviteBtn,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Invite team member"
            >
              <UserPlus2 size={15} color={Theme.textOnPrimary} strokeWidth={2.3} />
              <Text style={styles.teamInviteBtnText}>Invite member</Text>
            </Pressable>
          )
        ) : null}
      </View>

      <View style={[styles.salesCard, styles.teamPanelCard]}>
        {inviteOpen ? (
          <InviteMemberFlow
            orgId={orgId}
            layout="embedded"
            onClose={closeInvite}
            onInvited={handleInvited}
          />
        ) : (
          <TeamMembersView
            orgId={orgId}
            currentUserId={currentUserId}
            canManage={canManage}
            onInvite={canManage ? openInvite : undefined}
            initialSubTab={focusPending ? "pending" : undefined}
            embedded
            desktopMetronic
          />
        )}
      </View>
    </View>
  );
}
