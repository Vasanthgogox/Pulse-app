/**
 * Mission Radar — Alert Registry dropdown (bell popover).
 * WhatsApp bootstrap: feed from global sync store; 15 visible, load more (+15 in-memory or DB page).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Theme from "@/constants/Theme";
import { AlertRegistrySignalCard } from "@/components/AlertRegistrySignalCard";
import type { AlertSignalStatus } from "@/components/AlertRegistrySignalCard";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import { REGISTRY_PAGE_SIZE } from "@/lib/globalSync/registryFeed.constants";
import { useRegistryFeed } from "@/lib/globalSync/useRegistryFeed";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { sharedLedgerActionLabel } from "@/lib/sharedLedger/registryLabels";
import type { SalaryRequestWithDriverRow } from "@/services/salaryRequestsService";
import type { SharedLedgerNotificationRow } from "@/services/sharedLedgerNotificationsService";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronDown, Radar, RefreshCw, X } from "lucide-react-native";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Now";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Now";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function categoryMeta(item: GlobalOperationAlert): {
  typeLabel: string;
  status: AlertSignalStatus;
} {
  if (item.category === "late_log") {
    return { typeLabel: "LATE LOG", status: "WARNING" };
  }
  if (item.category === "unassigned_trip") {
    return { typeLabel: "UNASSIGNED TRIP", status: "ACTION" };
  }
  if (item.category === "vehicle_idle") {
    return { typeLabel: "IDLE", status: "WARNING" };
  }
  if (item.category === "payment_received") {
    return { typeLabel: "PAYMENT", status: "INFO" };
  }
  const label = item.category.replace(/_/g, " ").toUpperCase();
  return {
    typeLabel: label.slice(0, 18),
    status: item.kind === "critical" ? "ACTION" : "WARNING",
  };
}

export type AlertRegistryFinanceHandlers = {
  onRejectSalary: (requestId: string) => void;
  onPaySalary: (req: SalaryRequestWithDriverRow) => void;
  onMarkSharedRead: (notificationId: string) => void;
  onSharedAction: (item: SharedLedgerNotificationRow) => void;
  busySalaryId: string | null;
};

export type AlertRegistryPanelLayout = "popover" | "fullscreen";

export type AlertRegistryPanelProps = {
  tab: "active" | "history";
  onTabChange: (tab: "active" | "history") => void;
  onClose: () => void;
  onSync?: () => void | Promise<void>;
  syncing?: boolean;
  finance: AlertRegistryFinanceHandlers;
  /** Popover (desktop bell) vs full-screen mobile route. */
  layout?: AlertRegistryPanelLayout;
  topInset?: number;
  bottomInset?: number;
};

function RegistryFeedList({
  tab,
  visibleCount,
  finance,
  cardActionStyles,
}: {
  tab: "active" | "history";
  visibleCount: number;
  finance: AlertRegistryFinanceHandlers;
  cardActionStyles: {
    registryCardActions: object;
    registryGhostBtn: object;
    registryGhostBtnText: object;
    registryPrimaryBtn: object;
    registryPrimaryBtnText: object;
    registryStatusText: object;
  };
}) {
  const auth = useOptionalAuth();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const bootstrapStatus = useGlobalSyncStore((s) => s.bootstrapStatus);
  const { feed } = useRegistryFeed(tab, orgId);

  const visible = feed.slice(0, visibleCount);

  if (auth?.profile?.role === "driver" || !orgId || bootstrapStatus !== "ready") {
    return null;
  }

  if (tab === "history" && feed.length === 0) {
    return (
      <Text style={styles.emptyHint}>
        Finance and ledger history appears here after items are read or resolved.
      </Text>
    );
  }

  if (tab === "active" && feed.length === 0) {
    return (
      <Text style={styles.emptyHint}>
        All clear — waiting for realtime signals.
      </Text>
    );
  }

  return (
    <>
      {visible.map((entry) => {
        if (entry.kind === "ops" && entry.ops) {
          const meta = categoryMeta(entry.ops);
          return (
            <AlertRegistrySignalCard
              key={entry.id}
              typeLabel={meta.typeLabel}
              title={entry.ops.title}
              detail={entry.ops.subtitle ?? "Review operational protocol."}
              tripId={entry.ops.trip_number}
              timeLabel={formatRelativeTime(entry.ops.created_at)}
              status={meta.status}
            />
          );
        }
        if (entry.kind === "shared" && entry.shared) {
          const item = entry.shared;
          return (
            <AlertRegistrySignalCard
              key={entry.id}
              typeLabel="SHARED LEDGER"
              title={item.title}
              detail={`${sharedLedgerActionLabel(item.event_type)} · ${new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`}
              status="INFO"
              footer={
                tab === "active" ? (
                  <View style={cardActionStyles.registryCardActions}>
                    <TouchableOpacity
                      style={cardActionStyles.registryGhostBtn}
                      onPress={() => finance.onMarkSharedRead(item.id)}
                    >
                      <Text style={cardActionStyles.registryGhostBtnText}>
                        Read
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={cardActionStyles.registryPrimaryBtn}
                      onPress={() => finance.onSharedAction(item)}
                    >
                      <Text style={cardActionStyles.registryPrimaryBtnText}>
                        {sharedLedgerActionLabel(item.event_type)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={cardActionStyles.registryStatusText}>
                    {String(item.status ?? "").toUpperCase()}
                  </Text>
                )
              }
            />
          );
        }
        if (entry.kind === "salary" && entry.salary) {
          const req = entry.salary;
          return (
            <AlertRegistrySignalCard
              key={entry.id}
              typeLabel="SALARY REQUEST"
              title={`${req.drivers?.name ?? "Driver"} requested payment`}
              detail={`${req.request_type.replace("_", " ")} · ₹${Number(req.amount ?? 0).toLocaleString("en-IN")}`}
              status="ACTION"
              timeLabel={new Date(req.created_at).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              })}
              footer={
                tab === "active" ? (
                  <View style={cardActionStyles.registryCardActions}>
                    <TouchableOpacity
                      style={cardActionStyles.registryGhostBtn}
                      onPress={() => finance.onRejectSalary(req.id)}
                      disabled={finance.busySalaryId === req.id}
                    >
                      <Text style={cardActionStyles.registryGhostBtnText}>
                        Reject
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={cardActionStyles.registryPrimaryBtn}
                      onPress={() => finance.onPaySalary(req)}
                    >
                      <Text style={cardActionStyles.registryPrimaryBtnText}>
                        Pay now
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={cardActionStyles.registryStatusText}>
                    {String(req.status ?? "").toUpperCase()}
                  </Text>
                )
              }
            />
          );
        }
        return null;
      })}
    </>
  );
}

export function AlertRegistryPanel({
  tab,
  onTabChange,
  onClose,
  onSync,
  syncing = false,
  finance,
  layout = "popover",
  topInset = 0,
  bottomInset = 0,
}: AlertRegistryPanelProps) {
  const isFullscreen = layout === "fullscreen";
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const [syncSpin, setSyncSpin] = useState(false);
  const [visibleCount, setVisibleCount] = useState(REGISTRY_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const salaryRequestsHasMore = useGlobalSyncStore((s) => s.salaryRequestsHasMore);
  const loadMoreSalaryRequests = useGlobalSyncStore((s) => s.loadMoreSalaryRequests);
  const { feed } = useRegistryFeed(tab, orgId);
  const hasMoreInMemory = visibleCount < feed.length;
  const hasMoreInDb = tab === "active" && salaryRequestsHasMore;
  const showLoadMore = hasMoreInMemory || hasMoreInDb;

  useEffect(() => {
    setVisibleCount(REGISTRY_PAGE_SIZE);
  }, [tab]);

  const handleSync = async () => {
    if (!onSync) return;
    setSyncSpin(true);
    try {
      await onSync();
      setVisibleCount(REGISTRY_PAGE_SIZE);
    } finally {
      setSyncSpin(false);
    }
  };

  const handleLoadMore = useCallback(async () => {
    const nextVisible = visibleCount + REGISTRY_PAGE_SIZE;
    if (hasMoreInMemory) {
      setVisibleCount(nextVisible);
      return;
    }
    if (!hasMoreInDb || !orgId) return;
    setLoadingMore(true);
    try {
      await loadMoreSalaryRequests(orgId);
      setVisibleCount(nextVisible);
    } finally {
      setLoadingMore(false);
    }
  }, [
    visibleCount,
    hasMoreInMemory,
    hasMoreInDb,
    orgId,
    loadMoreSalaryRequests,
  ]);

  const cardActionStyles = useMemo(
    () => ({
      registryCardActions: styles.registryCardActions,
      registryGhostBtn: styles.registryGhostBtn,
      registryGhostBtnText: styles.registryGhostBtnText,
      registryPrimaryBtn: styles.registryPrimaryBtn,
      registryPrimaryBtnText: styles.registryPrimaryBtnText,
      registryStatusText: styles.registryStatusText,
    }),
    [],
  );

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
          colors={["#171A20", "#1e293b"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerGlow} pointerEvents="none" />
        <View style={styles.headerTextCol}>
          <View style={styles.missionRow}>
            <Radar size={12} color="#818cf8" />
            <Text style={styles.missionTitle}>Mission Radar</Text>
          </View>
          <Text style={styles.missionSub}>
            Automated operational surveillance
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close alert registry"
        >
          <X size={16} color="#94a3b8" />
        </Pressable>
      </View>

      <View style={[styles.body, isFullscreen && { flex: 1 }]}>
        <View style={styles.tabTrack}>
          {(["active", "history"] as const).map((t) => {
            const selected = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => onTabChange(t)}
                style={[styles.tabBtn, selected && styles.tabBtnActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[styles.tabText, selected && styles.tabTextActive]}
                >
                  {t === "active" ? "ACTIVE" : "HISTORY"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Critical signals</Text>
          <View style={styles.liveAudit}>
            <View style={styles.liveDot} />
            <Text style={styles.liveAuditText}>Live audit</Text>
          </View>
        </View>

        <ScrollView
          style={[styles.scroll, isFullscreen && { flex: 1, maxHeight: undefined }]}
          contentContainerStyle={[
            styles.scrollContent,
            isFullscreen && { paddingBottom: bottomInset + 8 },
          ]}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          <RegistryFeedList
            tab={tab}
            visibleCount={visibleCount}
            finance={finance}
            cardActionStyles={cardActionStyles}
          />
          {showLoadMore ? (
            <Pressable
              onPress={() => void handleLoadMore()}
              style={styles.loadMoreBtn}
              disabled={loadingMore}
              accessibilityRole="button"
              accessibilityLabel="Load more alerts"
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={Theme.textMuted} />
              ) : (
                <ChevronDown size={12} color={Theme.textMuted} />
              )}
              <Text style={styles.loadMoreText}>
                {loadingMore
                  ? "Loading…"
                  : `Load ${REGISTRY_PAGE_SIZE} more`}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>

      <View
        style={[
          styles.footer,
          isFullscreen && { paddingBottom: 10 + bottomInset },
        ]}
      >
        <Pressable
          onPress={() => void handleSync()}
          style={styles.syncBtn}
          disabled={syncing || syncSpin}
          accessibilityRole="button"
          accessibilityLabel="Refresh registry"
        >
          {syncing || syncSpin ? (
            <ActivityIndicator size="small" color={Theme.textMuted} />
          ) : (
            <RefreshCw size={11} color={Theme.textMuted} />
          )}
          <Text style={styles.syncBtnText}>Authorized registry sync</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: 440,
    maxWidth: Platform.OS === "web" ? ("96vw" as unknown as number) : "100%",
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
    width: 100,
    height: 100,
    borderBottomLeftRadius: 100,
    backgroundColor: "rgba(99,102,241,0.12)",
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    zIndex: 1,
  },
  missionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  missionTitle: {
    fontSize: 9,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  missionSub: {
    fontSize: 7,
    fontWeight: "400",
    color: "rgba(148,163,184,0.9)",
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
    paddingBottom: 6,
    gap: 10,
    backgroundColor: Theme.cardWhite,
  },
  tabTrack: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: 16,
    backgroundColor: "rgba(241,245,249,0.9)",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 14px rgba(15,23,42,0.1)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
      },
    }),
  },
  tabText: {
    fontSize: 8,
    fontWeight: "500",
    letterSpacing: 0.7,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  tabTextActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "600",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    minHeight: 18,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.networkSectionLabel,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  liveAudit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Theme.teslaRed,
  },
  liveAuditText: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.teslaRed,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    gap: 8,
    paddingBottom: 6,
    paddingRight: 2,
  },
  emptyHint: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 16,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  loadMoreText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: "#FBFBFB",
    alignItems: "center",
  },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minWidth: 200,
  },
  syncBtnText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  registryCardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 2,
  },
  registryGhostBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  registryGhostBtnText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  registryPrimaryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#171A20",
    backgroundColor: "#171A20",
  },
  registryPrimaryBtnText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  registryStatusText: {
    fontSize: 7,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
    textAlign: "right" as const,
  },
});
