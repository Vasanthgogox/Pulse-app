import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { AlertTriangle, Bell, CheckCircle2, Radio, Truck, X } from "lucide-react-native";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import { lateMonitoringTripsFromActive } from "@/lib/globalSync/lateMonitoringFromTrips.util";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useOperationsShelfItems } from "@/lib/globalSync/useOperationsDerived";
import { useWebLayoutWidth } from "@/lib/useWebLayoutWidth";
import { useChatStore, type TripEntry } from "@/features/chat/store/useChatStore";

function formatMoneyInr(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n >= 0 ? "" : "−";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN")}`;
}

function countPendingFeedbackTripsForOrg(
  trips: Record<string, TripEntry>,
  orgId: string,
): number {
  const seen = new Set<string>();
  for (const entry of Object.values(trips)) {
    if (!entry?.tripId) continue;
    const ownerOrg = entry.tripOrganizationId?.trim() ?? "";
    const isTripOwnerViewer = ownerOrg !== "" && ownerOrg === orgId;
    for (const p of Object.values(entry.parties)) {
      if (!p) continue;
      if (p.feedbackStatus !== "pending") continue;
      if (!isTripOwnerViewer && p.organizationId !== orgId) continue;
      if (seen.has(entry.tripId)) continue;
      seen.add(entry.tripId);
    }
  }
  return seen.size;
}

function SidebarRow({ item, glow }: { item: GlobalOperationAlert; glow: boolean }) {
  const icon =
    item.kind === "critical" ? (
      <AlertTriangle size={16} color="#dc2626" />
    ) : item.kind === "warning" ? (
      <Radio size={16} color="#ea580c" />
    ) : item.kind === "success" ? (
      <CheckCircle2 size={16} color="#16a34a" />
    ) : (
      <Truck size={16} color="#4F46E5" />
    );
  const money = formatMoneyInr(item.amount);

  return (
    <MotiView
      animate={{
        shadowOpacity: glow ? 0.55 : 0.08,
        shadowRadius: glow ? 22 : 8,
        borderColor: glow ? "rgba(34,197,94,0.65)" : "rgba(226,232,240,1)",
      }}
      transition={{ type: "timing", duration: 220 }}
      style={[styles.rowCard, glow && styles.rowCardGlow]}
    >
      <View style={styles.rowTop}>
        <View style={styles.iconWrap}>{icon}</View>
        <View style={styles.rowBody}>
          <Text style={styles.cat}>{item.category.replace(/_/g, " ")}</Text>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.rowSub} numberOfLines={2}>
              {item.subtitle}
            </Text>
          ) : null}
          {money ? <Text style={styles.money}>{money}</Text> : null}
          {item.trip_number ? <Text style={styles.trip}>{item.trip_number}</Text> : null}
        </View>
      </View>
    </MotiView>
  );
}

/**
 * Desktop web: compact bell (replaces the fixed “Live operations” sidebar).
 * Tap to open the same shelf content in a dropdown panel.
 */
export function OperationsNotificationBell() {
  const layoutWidth = useWebLayoutWidth();
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const org = useOptionalOrganization();
  const auth = useOptionalAuth();
  const orgId = org?.currentOrganization?.id ?? null;
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const ledgerPulseTripId = useGlobalSyncStore((s) => s.ledgerPulseTripId);
  const ledgerPulseAtMs = useGlobalSyncStore((s) => s.ledgerPulseAtMs);

  const items = useOperationsShelfItems();
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const lateMonitoringAlerts = useMemo((): GlobalOperationAlert[] => {
    const covered = new Set(
      items.map((i) => i.trip_id).filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    return lateMonitoringTripsFromActive(activeTrips, covered).map((t) => {
      const last = t.recent_events?.length ? t.recent_events[t.recent_events.length - 1] : undefined;
      const preview = (last?.content ?? "").trim().slice(0, 140);
      return {
        id: `late_monitor:${t.trip_id}`,
        priority_weight: 130,
        kind: "critical",
        category: "late_log",
        trip_id: t.trip_id,
        trip_number: t.display_trip_id ?? t.trip_number,
        title: "12-ping lane · behind pace",
        subtitle: preview || "Review trip chat for schedule signals.",
        amount: null,
        created_at: t.created_at,
        source: "trip_recent_event",
      };
    });
  }, [activeTrips, items]);
  const criticalItems = useMemo(() => items.filter((i) => i.kind === "critical"), [items]);
  const routineItems = useMemo(() => items.filter((i) => i.kind !== "critical"), [items]);
  const pendingFeedbackTrips = useChatStore((s) =>
    orgId ? countPendingFeedbackTripsForOrg(s.trips, orgId) : 0,
  );

  const [open, setOpen] = useState(false);
  const [glowTick, setGlowTick] = useState(0);
  useEffect(() => {
    if (!ledgerPulseAtMs) return;
    setGlowTick((t) => t + 1);
    const id = setTimeout(() => setGlowTick((t) => t + 1), 4200);
    return () => clearTimeout(id);
  }, [ledgerPulseAtMs, ledgerPulseTripId]);

  const glowActive = useMemo(() => {
    const age = Date.now() - ledgerPulseAtMs;
    return ledgerPulseTripId && age >= 0 && age < 4000;
  }, [glowTick, ledgerPulseAtMs, ledgerPulseTripId]);

  const isDesktopWeb = Platform.OS === "web" && layoutWidth >= Layout.webDesktopMinWidth;
  const badgeTotal = items.length + pendingFeedbackTrips + lateMonitoringAlerts.length;

  if (!isDesktopWeb || auth?.profile?.role === "driver" || !orgId || bootstrapStatus !== "ready") {
    return null;
  }

  const sheetW = Math.min(380, winW - 32);
  const sheetMaxH = Math.min(560, Math.round(winW > 0 ? winW * 0.72 : 480));

  return (
    <>
      <View
        style={[styles.bellAnchor, { top: insets.top + 10, right: Layout.screenPaddingHorizontal }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.bellTile, pressed && styles.bellTilePressed]}
          accessibilityRole="button"
          accessibilityLabel="Open live operations"
          hitSlop={8}
        >
          <Bell size={22} color="#475569" strokeWidth={2} />
          {badgeTotal > 0 ? (
            <View style={styles.badge} accessibilityLabel={`${badgeTotal} notifications`}>
              <Text style={styles.badgeText}>{badgeTotal > 9 ? "9+" : String(badgeTotal)}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.sheet,
              {
                top: insets.top + 52,
                right: Layout.screenPaddingHorizontal,
                width: sheetW,
                maxHeight: sheetMaxH,
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Live operations</Text>
              <View style={styles.sheetHeaderRight}>
                {pendingFeedbackTrips > 0 ? (
                  <View style={styles.feedbackBadge} accessibilityLabel="Pending trip feedback">
                    <Text style={styles.feedbackBadgeText}>Feedback {pendingFeedbackTrips}</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => setOpen(false)}
                  hitSlop={10}
                  style={styles.closeIcon}
                  accessibilityLabel="Close"
                >
                  <X size={18} color={Theme.textSecondary} />
                </Pressable>
              </View>
            </View>
            <ScrollView
              style={[styles.scroll, { maxHeight: Math.max(140, sheetMaxH - 52) }]}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
            >
              {items.length === 0 && lateMonitoringAlerts.length === 0 ? (
                <Text style={styles.empty}>All clear — waiting for Realtime signals.</Text>
              ) : (
                <>
                  {lateMonitoringAlerts.length > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Late monitoring</Text>
                      {lateMonitoringAlerts.map((item) => (
                        <SidebarRow key={item.id} item={item} glow={false} />
                      ))}
                    </View>
                  ) : null}
                  {criticalItems.length > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Critical monitor</Text>
                      {criticalItems.map((item) => (
                        <SidebarRow
                          key={item.id}
                          item={item}
                          glow={Boolean(
                            glowActive &&
                              item.trip_id === ledgerPulseTripId &&
                              item.category === "payment_received",
                          )}
                        />
                      ))}
                    </View>
                  ) : null}
                  {routineItems.length > 0 ? (
                    <View style={styles.section}>
                      {criticalItems.length > 0 ? (
                        <Text style={styles.sectionTitle}>Live operations</Text>
                      ) : null}
                      {routineItems.map((item) => (
                        <SidebarRow
                          key={item.id}
                          item={item}
                          glow={Boolean(
                            glowActive &&
                              item.trip_id === ledgerPulseTripId &&
                              item.category === "payment_received",
                          )}
                        />
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellAnchor: {
    position: "absolute",
    zIndex: 260,
    alignItems: "flex-end",
  },
  bellTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  bellTilePressed: {
    backgroundColor: "#f8fafc",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 22,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.2)",
  },
  sheet: {
    position: "absolute",
    backgroundColor: Theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderMedium,
  },
  sheetTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Theme.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  sheetHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  feedbackBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(79,70,229,0.12)",
    borderWidth: 1,
    borderColor: "rgba(79,70,229,0.25)",
  },
  feedbackBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textPrimary,
    letterSpacing: 0.4,
  },
  closeIcon: {
    padding: 4,
  },
  scroll: { minHeight: 0 },
  scrollContent: { paddingHorizontal: 12, paddingBottom: 20, gap: 8 },
  section: { gap: 8, marginBottom: 4 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Theme.textSecondary,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  empty: { fontSize: 13, color: Theme.textSecondary, paddingHorizontal: 4, lineHeight: 20 },
  rowCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    backgroundColor: Theme.cardWhite,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
  },
  rowCardGlow: {
    backgroundColor: "rgba(240,253,244,0.95)",
  },
  rowTop: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  cat: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  rowTitle: { marginTop: 2, fontSize: 14, fontWeight: "800", color: Theme.textPrimary },
  rowSub: { marginTop: 4, fontSize: 12, color: Theme.textRouteCard, lineHeight: 16 },
  money: { marginTop: 6, fontSize: 15, fontWeight: "900", color: "#15803d" },
  trip: { marginTop: 4, fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
});
