/**
 * Integrated chat — right-anchored floating drawer (notifications pattern).
 * Does not resize or split the page content underneath.
 */
import { RegistryWebDrawer } from "@/components/RegistryWebDrawer";
import Theme from "@/constants/Theme";
import {
  NetworkDesktopChatFlexPanel,
  type NetworkChatJoinRequest,
  type NetworkChatPartner,
} from "@/features/network/components/desktop/NetworkDesktopChatFlexPanel";
import { networkDesktopChatStyles as styles } from "@/features/network/components/desktop/networkDesktopChat.styles";
import { useEffect, useState, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CHAT_DRAWER_WIDTH = 400;
const CHAT_INSET_RIGHT = 12;
const CHAT_INSET_TOP = 12;
const CHAT_INSET_BOTTOM = 12;

type PanelProps = {
  orgId: string;
  orgName: string;
  onClose: () => void;
  joinRequest?: NetworkChatJoinRequest | null;
  integratedPartners?: NetworkChatPartner[];
  initialPartnerOrgId?: string | null;
  singlePartnerMode?: boolean;
};

type Props = PanelProps & {
  visible: boolean;
};

function ChatDrawerShell({ children }: { children: ReactNode }) {
  return <View style={styles.drawerShell}>{children}</View>;
}

function NativeChatOverlay({ visible, onClose, children }: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const webFixed = Platform.OS === "web" ? ({ position: "fixed" } as ViewStyle) : {};

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable
          onPress={onClose}
          style={[styles.nativeBackdrop, webFixed, StyleSheet.absoluteFillObject]}
          accessibilityRole="button"
          accessibilityLabel="Close chat"
        />
        <View
          style={[
            styles.nativeDrawer,
            webFixed,
            {
              top: insets.top + CHAT_INSET_TOP,
              right: CHAT_INSET_RIGHT,
              bottom: insets.bottom + CHAT_INSET_BOTTOM,
              width: CHAT_DRAWER_WIDTH,
            },
          ]}
        >
          <ChatDrawerShell>{children}</ChatDrawerShell>
        </View>
      </View>
    </Modal>
  );
}

export function NetworkDesktopChatOverlay({
  visible,
  onClose,
  ...panelProps
}: Props) {
  const [webReady, setWebReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") setWebReady(true);
  }, []);

  const panel = (
    <NetworkDesktopChatFlexPanel {...panelProps} onClose={onClose} embedded />
  );

  if (!visible) return null;

  if (Platform.OS === "web" && webReady) {
    return (
      <RegistryWebDrawer
        visible
        onClose={onClose}
        width={CHAT_DRAWER_WIDTH}
        insetRight={CHAT_INSET_RIGHT}
        insetTop={CHAT_INSET_TOP}
        insetBottom={CHAT_INSET_BOTTOM}
      >
        <ChatDrawerShell>{panel}</ChatDrawerShell>
      </RegistryWebDrawer>
    );
  }

  if (Platform.OS === "web") return null;

  return (
    <NativeChatOverlay visible onClose={onClose}>
      {panel}
    </NativeChatOverlay>
  );
}
