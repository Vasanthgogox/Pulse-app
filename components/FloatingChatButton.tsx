import { usePathname, useRouter } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useIntegratedChat } from "@/features/chat/contexts/IntegratedChatContext";
import { useTripChat } from "@/features/chat/contexts/TripChatContext";

const FAB_SIZE = 46;

function useShouldShow(): boolean {
  const pathname = usePathname();
  if (!pathname) return false;
  // Hide on the chat screen itself
  if (pathname.includes("chat")) return false;
  // Show on all main tab screens (web strips group prefix so /finance works too)
  const p = pathname.replace("/(tabs)", "");
  return p === "/finance" || p === "/trips" || p === "/network";
}

function useTotalUnread(): number {
  const { getTotalUnreadCount: tripUnread } = useTripChat();
  const { getTotalUnreadCount: netUnread } = useIntegratedChat();
  return tripUnread("dispatcher") + netUnread();
}

export function FloatingChatButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const show = useShouldShow();
  const unread = useTotalUnread();

  if (!show) return null;

  const bottom =
    Layout.demoTabBarScrollBottomInset +
    insets.bottom +
    Layout.tabBarBottomPaddingMin;

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push("/(modals)/chat")}
        style={styles.touchable}
        accessibilityLabel="Open Chat"
      >
        <View style={styles.circle}>
          <MessageCircle size={20} color="#fff" strokeWidth={2} />
          {unread > 0 && (
            <View style={styles.badge}>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    zIndex: 998,
  },
  touchable: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: "#1e40af",
    borderWidth: 1.5,
    borderColor: Theme.borderOnDark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1e40af",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
    borderWidth: 1.5,
    borderColor: "#1e40af",
  },
});
