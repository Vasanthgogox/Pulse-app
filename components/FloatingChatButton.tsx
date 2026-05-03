import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "expo-router";
import { Hash, MessageSquare, Plus, Users, X } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useIntegratedChat } from "@/features/chat/contexts/IntegratedChatContext";
import { useTripChat } from "@/features/chat/contexts/TripChatContext";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { useMobileNetworkDockExpanded } from "@/lib/mobileDockState";
import { ROUTES } from "@/lib/routes";

type ChatTab = "trips" | "network";

function useShouldShow(): boolean {
  const pathname = usePathname();
  if (!pathname) return false;
  if (pathname.includes("chat")) return false;
  // Driver shell has its own trip chat entry points — avoid stacking this FAB over driver UI (web/native).
  if (pathname.includes("(driver)")) return false;
  const p = pathname.replace(/\/$/, "");
  const ungrouped = p.replace("/(tabs)", "");
  return (
    p === ROUTES.TABS.FINANCE ||
    p === ROUTES.TABS.TRIPS ||
    p === ROUTES.TABS.NETWORK ||
    p === ROUTES.PULSE_LOADS ||
    ungrouped === "/finance" ||
    ungrouped === "/trips" ||
    ungrouped === "/network" ||
    ungrouped === ROUTES.PULSE_LOADS
  );
}

function useTotalUnread(): number {
  const { getTotalUnreadCount: tripUnread } = useTripChat();
  const { getTotalUnreadCount: netUnread } = useIntegratedChat();
  return tripUnread() + netUnread();
}

export function FloatingChatButton() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const show = useShouldShow();
  const unread = useTotalUnread();
  const networkDockExpanded = useMobileNetworkDockExpanded();
  const [showPreview, setShowPreview] = useState(false);
  const [chatTab, setChatTab] = useState<ChatTab>("trips");
  const { chats } = useIntegratedChat();
  const { conversations, getTotalUnreadCount } = useTripChat();
  const tripUnread = getTotalUnreadCount();
  const networkUnread = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const networkRows = useMemo(
    () =>
      chats.slice(0, 5).map((c) => ({
        id: c.id,
        type: "network" as const,
        title: c.partnerName,
        lastMsg: c.messages[c.messages.length - 1]?.content ?? "Open secure channel",
        time: c.lastActivity || "now",
        code: c.partnerName.slice(0, 2).toUpperCase(),
        unread: c.unreadCount || 0,
      })),
    [chats]
  );

  const tripRows = useMemo(
    () =>
      conversations.slice(0, 5).map((c) => ({
        id: c.id,
        type: "trips" as const,
        title: getTripDisplayNumber({
          display_trip_id: c.display_trip_id ?? null,
          trip_number: c.trip_number,
        } as any),
        lastMsg: c.last_message_preview || `${c.pickup_area} -> ${c.drop_location}`,
        time: c.last_message_at
          ? new Date(c.last_message_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : "now",
        code: getTripDisplayNumber({
          display_trip_id: c.display_trip_id ?? null,
          trip_number: c.trip_number,
        } as any)
          .slice(0, 2)
          .toUpperCase(),
        unread: c.unread_dispatcher_count || 0,
      })),
    [conversations]
  );

  const normalizedPath = (pathname ?? "").replace("/(tabs)", "");

  useEffect(() => {
    // Always collapse preview on route change for predictable mobile UX.
    setShowPreview(false);
  }, [normalizedPath]);

  if (!show) return null;

  const bottom =
    Layout.demoTabBarScrollBottomInset +
    insets.bottom +
    Layout.tabBarBottomPaddingMin +
    (networkDockExpanded ? 78 : 0);

  const previewWidth = Math.max(290, Math.min(380, width - 28));

  return (
    <View
      style={[styles.wrap, { bottom }, networkDockExpanded && styles.wrapDockExpanded]}
      pointerEvents="box-none"
    >
      {showPreview && (
        <View style={[styles.previewCard, { width: previewWidth }]}>
          <View style={styles.previewHead}>
            <View style={styles.previewHeadRow}>
              <View style={styles.previewIcon}>
                <MessageSquare size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewTitle}>PULSE CHAT</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPreview(false)} style={styles.closeBtn}>
                <X size={16} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.tabRow}>
              <TouchableOpacity
                onPress={() => setChatTab("trips")}
                style={[styles.tabBtn, chatTab === "trips" && styles.tabBtnActive]}
                accessibilityRole="button"
                accessibilityLabel="Switch to trips chat list"
              >
                <Hash size={12} color={chatTab === "trips" ? "#fff" : "rgba(255,255,255,0.5)"} />
                <Text style={[styles.tabText, chatTab === "trips" && styles.tabTextActive]}>TRIPS</Text>
                <View style={[styles.tabCount, chatTab === "trips" && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, chatTab === "trips" && styles.tabCountTextActive]}>
                    {tripUnread > 9 ? "9+" : String(tripUnread)}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setChatTab("network")}
                style={[styles.tabBtn, chatTab === "network" && styles.tabBtnLight]}
                accessibilityRole="button"
                accessibilityLabel="Switch to network direct messages"
              >
                <Users size={12} color={chatTab === "network" ? "#0f172a" : "rgba(255,255,255,0.5)"} />
                <Text
                  style={[
                    styles.tabText,
                    chatTab === "network" ? { color: "#0f172a" } : undefined,
                  ]}
                >
                  NETWORK
                </Text>
                <View style={[styles.tabCount, chatTab === "network" && styles.tabCountLight]}>
                  <Text style={[styles.tabCountText, chatTab === "network" && styles.tabCountTextLight]}>
                    {networkUnread > 9 ? "9+" : String(networkUnread)}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {(chatTab === "network" ? networkRows : tripRows).map((row) => (
              <Pressable
                key={row.id}
                onPress={() => {
                  setShowPreview(false);
                  router.push({
                    pathname: "/(modals)/chat",
                    params: {
                      tab: row.type,
                      conversationId: row.id,
                      openDetail: "1",
                      ts: String(Date.now()),
                    },
                  });
                }}
                style={styles.itemRow}
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${row.title}`}
              >
                <View style={styles.itemAvatar}>
                  <Text style={styles.itemAvatarText}>{row.code}</Text>
                  {row.unread > 0 && (
                    <View style={styles.rowUnreadBadge}>
                      <Text style={styles.rowUnreadText}>{row.unread > 9 ? "9+" : String(row.unread)}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.itemTopRow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text style={styles.itemTime}>{row.time}</Text>
                  </View>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {row.lastMsg}
                  </Text>
                </View>
              </Pressable>
            ))}
            {((chatTab === "network" ? networkRows : tripRows).length === 0) && (
              <Text style={styles.emptyText}>No active channels</Text>
            )}
          </ScrollView>
          <TouchableOpacity
            style={styles.launchBtn}
            onPress={() => {
              setShowPreview(false);
              router.push("/(modals)/chat");
            }}
          >
            <Plus size={14} color="#fff" />
            <Text style={styles.launchBtnText}>INITIALIZE PROTOCOL</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => {
          setShowPreview((v) => !v);
        }}
        style={styles.touchable}
        accessibilityLabel="Open chat preview"
        accessibilityHint="Opens quick chat list and unread messages"
        accessibilityRole="button"
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <View style={styles.circle}>
          <View style={styles.innerRing} pointerEvents="none" />
          {showPreview ? (
            <X size={21} color="#fff" strokeWidth={2.4} />
          ) : (
            <MessageSquare size={21} color="#fff" strokeWidth={2.4} />
          )}
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : String(unread)}</Text>
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
  wrapDockExpanded: {
    paddingRight: Layout.screenPaddingHorizontal + 6,
  },
  touchable: {
    width: Layout.fabSize,
    height: Layout.fabSize,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: Layout.fabSize,
    height: Layout.fabSize,
    borderRadius: Layout.fabBorderRadius,
    backgroundColor: Theme.darkBackground,
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 10,
  },
  innerRing: {
    position: "absolute",
    width: Layout.fabSize - 10,
    height: Layout.fabSize - 10,
    borderRadius: (Layout.fabSize - 10) / 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    opacity: 0.9,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: "#0f172a",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  previewCard: {
    width: 360,
    maxHeight: 500,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 18,
    overflow: "hidden",
    shadowColor: "#020617",
    shadowOpacity: 0.24,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 24,
  },
  previewHead: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  previewHeadRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  previewIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  previewTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    minHeight: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  tabBtnActive: { backgroundColor: Theme.primary },
  tabBtnLight: { backgroundColor: "#fff" },
  tabText: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  tabTextActive: { color: "#fff" },
  tabCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tabCountActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  tabCountLight: { backgroundColor: "#e2e8f0" },
  tabCountText: { fontSize: 9, fontWeight: "900", color: "rgba(255,255,255,0.72)" },
  tabCountTextActive: { color: "#fff" },
  tabCountTextLight: { color: "#0f172a" },
  list: { maxHeight: 300 },
  listContent: { padding: 10, gap: 8 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 22,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  itemAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  itemAvatarText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  rowUnreadBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Theme.primary,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  rowUnreadText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  itemTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  itemTitle: {
    flex: 1,
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  itemTime: { color: "#94a3b8", fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  itemSub: { color: "#64748b", fontSize: 11, marginTop: 2, fontWeight: "600" },
  emptyText: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
    paddingVertical: 20,
    fontWeight: "600",
  },
  launchBtn: {
    margin: 12,
    marginTop: 6,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  launchBtnText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
});
