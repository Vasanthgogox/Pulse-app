/**
 * Inbound Protocol — connection-request invitation popover (desktop bell).
 * Data from global sync bootstrap (requests + batch partner avatars).
 */
import { useEffect } from "react";
import Theme from "@/constants/Theme";
import type { InboundProtocolInviteItem } from "@/lib/globalSync/inboundProtocol.types";
import { LinearGradient } from "expo-linear-gradient";
import { UserCheck, UserPlus, X } from "lucide-react-native";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export type { InboundProtocolInviteItem };

export type InboundProtocolPanelLayout = "popover" | "fullscreen";

export type InboundProtocolPanelProps = {
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
  onManageAll: () => void;
  layout?: InboundProtocolPanelLayout;
  topInset?: number;
  bottomInset?: number;
  showFooter?: boolean;
};

function inviteInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

function EmptyProtocolState() {
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.12, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconOuter}>
        <Animated.View style={[styles.emptyPingRing, ringStyle]} pointerEvents="none" />
        <View style={styles.emptyIconCircle}>
          <UserPlus size={28} color="#cbd5e1" strokeWidth={1.5} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>No pending invitations</Text>
      <Text style={styles.emptySub}>
        Awaiting external synchronization
      </Text>
    </View>
  );
}

function InviteAvatar({ item }: { item: InboundProtocolInviteItem }) {
  const initials = inviteInitials(item.name);
  if (item.avatarUri) {
    return (
      <View style={styles.inviteAvatar}>
        <Image
          source={{ uri: item.avatarUri }}
          style={styles.inviteAvatarImage}
          accessibilityLabel={`${item.name} avatar`}
        />
      </View>
    );
  }
  return (
    <View style={styles.inviteAvatar}>
      <Text style={styles.inviteAvatarText}>{initials}</Text>
    </View>
  );
}

function InviteCard({
  item,
  tab,
  busyId,
  onApprove,
  onReject,
  onCancel,
}: {
  item: InboundProtocolInviteItem;
  tab: "received" | "sent";
  busyId: string | null;
  onApprove: (item: InboundProtocolInviteItem) => void;
  onReject: (item: InboundProtocolInviteItem) => void;
  onCancel: (item: InboundProtocolInviteItem) => void;
}) {
  const busy =
    busyId === item.id ||
    (item.linkedRequestIds?.includes(busyId ?? "") ?? false);

  return (
    <View style={styles.inviteCard}>
      <View style={styles.inviteCardTop}>
        <InviteAvatar item={item} />
        <View style={styles.inviteTextCol}>
          <Text style={styles.inviteName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.subtitle ? (
            <Text style={styles.inviteSubtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          ) : null}
          <Text style={styles.inviteType} numberOfLines={1}>
            {item.type}
          </Text>
        </View>
      </View>

      {tab === "received" ? (
        <View style={styles.inviteActions}>
          <TouchableOpacity
            style={styles.invitePrimaryBtn}
            onPress={() => onApprove(item)}
            disabled={busy}
            activeOpacity={0.88}
          >
            {busy ? (
              <ActivityIndicator size="small" color={Theme.textOnDark} />
            ) : (
              <Text style={styles.invitePrimaryBtnText}>Accept</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inviteGhostBtn}
            onPress={() => onReject(item)}
            disabled={busy}
            activeOpacity={0.88}
          >
            <Text style={styles.inviteGhostBtnText}>Ignore</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.inviteGhostBtn, styles.inviteRecallBtn]}
          onPress={() => onCancel(item)}
          disabled={busy}
          activeOpacity={0.88}
        >
          {busy ? (
            <ActivityIndicator size="small" color={Theme.textSecondary} />
          ) : (
            <Text style={styles.inviteGhostBtnText}>Recall</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

export function InboundProtocolPanel({
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
  onManageAll,
  layout = "popover",
  topInset = 0,
  bottomInset = 0,
  showFooter = true,
}: InboundProtocolPanelProps) {
  const isFullscreen = layout === "fullscreen";
  const list = tab === "received" ? receivedItems : sentItems;
  const displayPending =
    tab === "received" ? pendingCount : sentItems.length;

  const fullscreenShell: ViewStyle | undefined = isFullscreen
    ? {
        flex: 1,
        width: "100%",
        maxWidth: "100%",
        borderRadius: 0,
        borderWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
      }
    : undefined;

  return (
    <View style={[styles.shell, fullscreenShell]}>
      <View style={[styles.header, isFullscreen && { paddingTop: 14 + topInset }]}>
        <LinearGradient
          colors={["#0F172A", "#1e293b"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerGlow} pointerEvents="none" />
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>Inbound Protocol</Text>
          <Text style={styles.headerSub}>
            {displayPending} pending sync
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close invitations"
        >
          <X size={16} color="#94a3b8" />
        </Pressable>
      </View>

      <View style={[styles.body, isFullscreen && styles.bodyFullscreen]}>
        <View style={styles.tabTrack}>
          {(["received", "sent"] as const).map((t) => {
            const selected = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => onTabChange(t)}
                style={[styles.tabBtn, selected && styles.tabBtnActiveDark]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[styles.tabText, selected && styles.tabTextActiveDark]}
                >
                  {t === "received" ? "RECEIVED" : "SENT"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={[styles.scroll, isFullscreen && { flex: 1, maxHeight: undefined, minHeight: undefined }]}
          contentContainerStyle={[
            styles.scrollContent,
            isFullscreen && { paddingBottom: bottomInset + 8 },
          ]}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {list.length === 0 ? (
            <EmptyProtocolState />
          ) : (
            list.map((item) => (
              <InviteCard
                key={item.id}
                item={item}
                tab={tab}
                busyId={busyId}
                onApprove={onApprove}
                onReject={onReject}
                onCancel={onCancel}
              />
            ))
          )}
        </ScrollView>
      </View>

      {showFooter ? (
        <View
          style={[
            styles.footer,
            isFullscreen && { paddingBottom: 12 + bottomInset },
          ]}
        >
          <Pressable
            onPress={onManageAll}
            style={styles.manageBtn}
            accessibilityRole="button"
            accessibilityLabel="Manage all requests"
          >
            <UserCheck size={14} color="#4f46e5" />
            <Text style={styles.manageBtnText}>Manage all requests</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: 440,
    maxWidth: "96vw" as const,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 24px 64px rgba(15,23,42,0.22)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.2,
        shadowRadius: 28,
        elevation: 24,
      },
    }),
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    overflow: "hidden",
  },
  headerGlow: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 88,
    height: 88,
    borderBottomLeftRadius: 88,
    backgroundColor: "rgba(99,102,241,0.14)",
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    zIndex: 1,
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 7,
    fontWeight: "500",
    color: "rgba(129,140,248,0.85)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    zIndex: 1,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: Theme.cardWhite,
  },
  tabTrack: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: 16,
    backgroundColor: "rgba(241,245,249,0.95)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActiveDark: {
    backgroundColor: "#0F172A",
    ...Platform.select({
      web: {
        boxShadow: "0 8px 20px rgba(15,23,42,0.25)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  tabText: {
    fontSize: 8,
    fontWeight: "500",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tabTextActiveDark: {
    color: Theme.textOnDark,
    fontWeight: "600",
  },
  scroll: {
    maxHeight: 320,
    minHeight: 200,
  },
  scrollContent: {
    gap: 10,
    paddingVertical: 4,
    paddingBottom: 6,
  },
  emptyWrap: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyIconOuter: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyPingRing: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: "500",
    fontStyle: "italic",
    color: "#cbd5e1",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 8,
    fontWeight: "500",
    color: "#e2e8f0",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  inviteCard: {
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    gap: 10,
    alignSelf: "stretch",
    width: "100%",
    ...Platform.select({
      web: {
        boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
      },
    }),
  },
  inviteCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  inviteAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    flexShrink: 0,
    overflow: "hidden",
  },
  inviteAvatarImage: {
    width: "100%",
    height: "100%",
  },
  inviteAvatarText: {
    fontSize: 13,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textOnDark,
  },
  inviteTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
  },
  inviteName: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
  },
  inviteSubtitle: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.1,
  },
  inviteType: {
    fontSize: 8,
    fontWeight: "600",
    color: "#6366f1",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inviteActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  invitePrimaryBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  invitePrimaryBtnText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  inviteGhostBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  inviteRecallBtn: {
    flex: undefined,
    width: "100%",
  },
  inviteGhostBtnText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: "#FBFBFB",
    alignItems: "center",
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  manageBtnText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
