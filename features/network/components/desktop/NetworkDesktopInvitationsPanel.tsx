/**
 * Invitations panel — embedded below Network hub tabs (desktop).
 */
import { InboundProtocolPanel } from "@/components/InboundProtocolPanel";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import { X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type Props = {
  tab: "received" | "sent";
  onTabChange: (tab: "received" | "sent") => void;
  onClose: () => void;
  pendingCount: number;
  receivedItems: InboundProtocolInviteItem[];
  sentItems: InboundProtocolInviteItem[];
  busyId: string | null;
  onApprove: (item: InboundProtocolInviteItem) => void;
  onReject: (item: InboundProtocolInviteItem) => void;
  onCancel: (item: InboundProtocolInviteItem) => void;
  onOpenInviteDetail?: (item: InboundProtocolInviteItem) => void;
};

export function NetworkDesktopInvitationsPanel({
  tab,
  onTabChange,
  onClose,
  pendingCount,
  receivedItems,
  sentItems,
  busyId,
  onApprove,
  onReject,
  onCancel,
  onOpenInviteDetail,
}: Props) {
  const layout = useProfileHubCompactLayout();
  return (
    <View style={[styles.panel, layout.panel]}>
      <View style={[styles.salesCard, styles.invitationsPanelCard]}>
        <View style={styles.invitationsPanelHead}>
          <View style={styles.invitationsPanelTitleCol}>
            <Text style={styles.sectionTitle}>Invitations</Text>
            <Text style={styles.sectionSub}>
              Connection and driver requests for your organization
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.invitationsCloseBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close invitations"
          >
            <X size={16} color={METRONIC.muted} strokeWidth={2} />
          </Pressable>
        </View>

        <InboundProtocolPanel
          layout="embedded"
          showHeader={false}
          showFooter={false}
          tab={tab}
          onTabChange={onTabChange}
          onClose={onClose}
          pendingCount={pendingCount}
          receivedItems={receivedItems}
          sentItems={sentItems}
          busyId={busyId}
          onApprove={onApprove}
          onReject={onReject}
          onCancel={onCancel}
          onOpenInviteDetail={onOpenInviteDetail}
          onManageAll={onClose}
        />
      </View>
    </View>
  );
}
