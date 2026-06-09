/**
 * Team tab — org members & invites (moved from workspace).
 */
import Theme from "@/constants/Theme";
import { TeamMembersView } from "@/features/organization/components/TeamMembersView";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { UserPlus2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type Props = {
  orgId: string;
  orgName: string;
  currentUserId: string | null;
  canManage: boolean;
  onInvite: () => void;
};

export function NetworkDesktopTeamPanel({
  orgId,
  orgName,
  currentUserId,
  canManage,
  onInvite,
}: Props) {
  return (
    <View style={styles.panel}>
      <View style={styles.sectionToolbar}>
        <View style={styles.teamPanelTitleCol}>
          <Text style={styles.sectionTitle}>Team members</Text>
          <Text style={styles.sectionSub}>
            Manage who can access {orgName || "your organization"}
          </Text>
        </View>
        {canManage ? (
          <Pressable
            onPress={onInvite}
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
        ) : null}
      </View>

      <View style={[styles.salesCard, styles.teamPanelCard]}>
        <TeamMembersView
          orgId={orgId}
          currentUserId={currentUserId}
          canManage={canManage}
          onInvite={canManage ? onInvite : undefined}
          embedded
          desktopMetronic
        />
      </View>
    </View>
  );
}
