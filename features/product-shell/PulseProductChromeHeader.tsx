/**
 * Product-shell top chrome — same layout as Core desktop (PULSE. · switcher · utilities).
 * Center: Invoice, POD, Finance & Analytics. Right: notifications, profile (no chat on Finance Pro).
 */
import { NotificationBellIcon } from "@/components/NotificationBellIcon";
import { WebNavMirrorToggle } from "@/components/demo/WebNavMirrorToggle";
import { WEB_TOP_NAV_ICON } from "@/components/demo/webTopNavIcon.tokens";
import { RegistryWebDrawer } from "@/components/RegistryWebDrawer";
import Theme from "@/constants/Theme";
import {
  DEFAULT_USER_2D_AVATAR_SEED,
  getUser2DAvatarUriForSeed,
} from "@/constants/UserAvatars";
import { useAuth } from "@/contexts/AuthContext";
import { FinanceProAlertsPanel } from "@/features/finance-pro/components/FinanceProAlertsPanel";
import { useFinanceProChromeAlerts } from "@/features/finance-pro/hooks/useFinanceProChromeAlerts";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import {
  getTotalChatUnreadCount as readTotalChatUnread,
  subscribeChatUnreadSignal,
} from "@/lib/chatUnreadSignal";
import { platformShadow } from "@/lib/platformShadow";
import { DEFAULT_DISPATCHER_ROUTE, ROUTES } from "@/lib/routes";
import type { ExpoProductShellId } from "@/lib/suite/suiteProducts";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useRouter } from "expo-router";
import { FileText, LineChart, MessageSquare, ScanLine } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NAV = [
  {
    id: "invoice" as const,
    title: "INVOICE",
    subtitle: "GST",
    Icon: FileText,
    href: ROUTES.PULSE_INVOICE,
  },
  {
    id: "pod" as const,
    title: "POD",
    subtitle: "PROOF",
    Icon: ScanLine,
    href: ROUTES.POD_RECONCILIATION,
  },
  {
    id: "finance-pro" as const,
    title: "FINANCE",
    subtitle: "ANALYTICS",
    Icon: LineChart,
    href: ROUTES.FINANCE_PRO,
  },
];

export function PulseProductChromeHeader({
  productId,
}: {
  productId: ExpoProductShellId;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const hideChat = productId === "finance-pro";
  const canOpenChat =
    !hideChat && (accessLoading || canSurface("sales.chat"));
  const canSeeNotifications =
    accessLoading ||
    canSurface("tripops.trips.view") ||
    canSurface("finance.view");
  const financeAlerts = useFinanceProChromeAlerts();
  const [showNotifications, setShowNotifications] = useState(false);
  const closeNotifications = useCallback(() => {
    setShowNotifications(false);
  }, []);
  const toggleNotifications = useCallback(() => {
    setShowNotifications((open) => !open);
  }, []);
  const messageUnreadCount = useSyncExternalStore(
    subscribeChatUnreadSignal,
    readTotalChatUnread,
    readTotalChatUnread,
  );
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const resolveAvatar = async () => {
      if (!profile) {
        if (mounted) setProfileAvatarUri(null);
        return;
      }
      if (profile.avatar_url?.startsWith("http")) {
        if (mounted) setProfileAvatarUri(profile.avatar_url);
        return;
      }
      if (profile.avatar_url?.trim()) {
        const signed = await getSignedAvatarUrl(profile.avatar_url.trim());
        if (mounted) setProfileAvatarUri(signed);
        return;
      }
      if (profile.avatar_seed?.trim()) {
        if (mounted)
          setProfileAvatarUri(getUser2DAvatarUriForSeed(profile.avatar_seed.trim()));
        return;
      }
      if (mounted)
        setProfileAvatarUri(getUser2DAvatarUriForSeed(DEFAULT_USER_2D_AVATAR_SEED));
    };
    void resolveAvatar();
    return () => {
      mounted = false;
    };
  }, [profile]);

  const initials = useMemo(() => {
    const displayName = (profile?.full_name ?? profile?.displayName ?? "User").trim();
    return (
      displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "P"
    );
  }, [profile?.full_name, profile?.displayName]);

  const activeIndex = Math.max(
    0,
    NAV.findIndex((item) => item.id === productId),
  );

  const brandWord =
    productId === "finance-pro"
      ? "PULSE FINANCE PRO"
      : productId === "invoice"
        ? "PULSE INVOICE"
        : productId === "pod"
          ? "PULSE POD"
          : "PULSE";

  return (
    <>
    <View
      style={[
        styles.shell,
        { paddingTop: insets.top + 10 },
        Platform.OS === "web"
          ? ({ backdropFilter: "blur(24px)" } as ViewStyle)
          : null,
      ]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={() => router.replace(DEFAULT_DISPATCHER_ROUTE as never)}
          style={({ pressed }) => [styles.brandWrap, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
          accessibilityLabel={`Open Pulse Core from ${brandWord}`}
        >
          <Text
            style={[
              styles.brandTitle,
              brandWord !== "PULSE" ? styles.brandTitleProduct : null,
            ]}
            numberOfLines={1}
          >
            {brandWord}
            <Text style={styles.brandDot}>.</Text>
          </Text>
        </Pressable>

        <WebNavMirrorToggle
          items={NAV}
          activeIndex={activeIndex}
          onSelect={(index) => {
            const item = NAV[index];
            if (!item || item.id === productId) return;
            router.push(item.href as never);
          }}
        />

        <View style={styles.utility}>
          {canOpenChat ? (
            <Pressable
              style={styles.iconHit}
              onPress={() => router.push(ROUTES.CHAT as never)}
              accessibilityRole="button"
              accessibilityLabel="Open chat"
            >
              <MessageSquare
                size={WEB_TOP_NAV_ICON.size}
                color={WEB_TOP_NAV_ICON.muted}
                strokeWidth={WEB_TOP_NAV_ICON.stroke}
              />
              {messageUnreadCount > 0 ? (
                <View style={[styles.iconDot, styles.iconDotChat]} />
              ) : null}
            </Pressable>
          ) : null}
          {canSeeNotifications ? (
            <Pressable
              style={styles.iconHit}
              onPress={toggleNotifications}
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
            >
              <NotificationBellIcon
                size={WEB_TOP_NAV_ICON.size}
                color={
                  showNotifications ? WEB_TOP_NAV_ICON.active : WEB_TOP_NAV_ICON.muted
                }
                strokeWidth={WEB_TOP_NAV_ICON.stroke}
                badgeCount={showNotifications ? 0 : financeAlerts.count}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() =>
              router.push({
                pathname: ROUTES.WORKSPACE,
                params: { panel: "account", fromProduct: productId },
              } as never)
            }
            style={styles.avatarBtn}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            {profileAvatarUri ? (
              <Image source={{ uri: profileAvatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
    {Platform.OS === "web" ? (
      <RegistryWebDrawer
        visible={showNotifications}
        onClose={closeNotifications}
      >
        <FinanceProAlertsPanel onClose={closeNotifications} />
      </RegistryWebDrawer>
    ) : (
      <Modal
        visible={showNotifications}
        animationType="slide"
        onRequestClose={closeNotifications}
      >
        <View style={[styles.nativeSheet, { paddingTop: insets.top }]}>
          <FinanceProAlertsPanel onClose={closeNotifications} />
        </View>
      </Modal>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.8)",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 20,
    paddingBottom: 10,
    zIndex: 200,
    ...platformShadow("0 1px 2px rgba(15, 23, 42, 0.05)", {
      color: "#0f172a",
      opacity: 0.05,
      radius: 2,
      offsetY: 1,
      elevation: 20,
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  brandWrap: {
    minWidth: 120,
    flexShrink: 1,
    paddingRight: 8,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null),
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#0f172a",
    fontStyle: "italic",
    letterSpacing: -0.9,
    lineHeight: 32,
  },
  brandTitleProduct: {
    fontSize: 22,
    letterSpacing: -0.6,
    lineHeight: 26,
  },
  brandDot: {
    color: Theme.darkGreen,
    fontSize: 24,
    lineHeight: 26,
  },
  utility: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    minWidth: 120,
    justifyContent: "flex-end",
    flexShrink: 0,
  },
  iconHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  iconDotChat: {
    backgroundColor: "#50CD89",
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
    borderWidth: 1.5,
    borderColor: "#181C32",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#181C32",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  nativeSheet: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
  },
});
