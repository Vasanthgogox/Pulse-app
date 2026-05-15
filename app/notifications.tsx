import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { resolveAvatarPublicUrl } from "@/lib/avatarUpload";
import { supabase } from "@/lib/supabase";
import {
    getSalaryRequestsByOrganization,
    updateSalaryRequestStatus,
    type SalaryRequestWithDriverRow,
} from "@/services/salaryRequestsService";
import {
    getSharedLedgerNotifications,
    markSharedLedgerNotificationRead,
    type SharedLedgerNotificationRow,
} from "@/services/sharedLedgerNotificationsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function requestTypeLabel(t: (k: string) => string, value: string): string {
  if (value === "monthly") return t("monthlySalary");
  if (value === "advance") return t("advance");
  return t("tripBased");
}

function sharedLedgerActionLabel(
  eventType: SharedLedgerNotificationRow["event_type"],
): string {
  if (eventType === "dispute_received") return "Raise dispute";
  if (eventType === "dispute_status_changed") return "View status";
  if (eventType === "pending_partner_followup") return "Follow up";
  if (eventType === "mismatch_detected") return "Compare now";
  return "Fix records";
}

function sharedLedgerIcon(
  eventType: SharedLedgerNotificationRow["event_type"],
): keyof typeof FontAwesome.glyphMap {
  if (eventType === "dispute_received") return "gavel";
  if (eventType === "dispute_status_changed") return "check-circle";
  if (eventType === "pending_partner_followup") return "clock-o";
  if (eventType === "mismatch_detected") return "exchange";
  return "exclamation-triangle";
}

function sharedLedgerEventMetaLabel(
  eventType: SharedLedgerNotificationRow["event_type"],
): string {
  if (eventType === "dispute_received") return "Dispute";
  if (eventType === "dispute_status_changed") return "Status";
  if (eventType === "pending_partner_followup") return "Follow up";
  if (eventType === "mismatch_detected") return "Mismatch";
  return "Reconcile";
}

function resolveSharedActionKind(
  eventType: SharedLedgerNotificationRow["event_type"],
  payload: Record<string, unknown>,
):
  | "review_dispute"
  | "raise_dispute"
  | "fix_records"
  | "compare_now"
  | "follow_up"
  | "view_status" {
  const explicit = typeof payload.cta_kind === "string" ? payload.cta_kind : "";
  if (
    explicit === "review_dispute" ||
    explicit === "raise_dispute" ||
    explicit === "fix_records" ||
    explicit === "compare_now" ||
    explicit === "follow_up" ||
    explicit === "view_status"
  ) {
    return explicit;
  }
  if (eventType === "dispute_received") return "review_dispute";
  if (eventType === "pending_partner_followup") return "follow_up";
  if (eventType === "mismatch_detected") return "compare_now";
  if (eventType === "partner_only_ghost") return "fix_records";
  return "view_status";
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<SalaryRequestWithDriverRow[]>([]);
  const [sharedNotifications, setSharedNotifications] = useState<
    SharedLedgerNotificationRow[]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [profileAvatarByUserId, setProfileAvatarByUserId] = useState<
    Record<string, { avatar_url: string | null; avatar_seed: string | null }>
  >({});
  const [activeTab, setActiveTab] = useState<"action_required" | "history">(
    "action_required",
  );
  const [sharedLoadError, setSharedLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const orgId = currentOrganization?.id ?? "";
    if (!orgId) {
      setRequests([]);
      setSharedNotifications([]);
      setSharedLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ requests: rows }, sharedRes] =
      await Promise.all([
        getSalaryRequestsByOrganization(orgId),
        getSharedLedgerNotifications(orgId, "all"),
      ]);
    const sharedRows = sharedRes.notifications ?? [];
    setRequests(rows);
    setSharedNotifications(sharedRows);
    setSharedLoadError(sharedRes.error ? sharedRes.error.message : null);
    const userIds = Array.from(
      new Set(
        rows
          .map((row) => String(row.drivers?.user_id ?? "").trim())
          .filter((id) => id.length > 0),
      ),
    );
    if (userIds.length > 0) {
      const { data } = await supabase()
        .from("profiles")
        .select("id, avatar_url, avatar_seed")
        .in("id", userIds);
      const map: Record<
        string,
        { avatar_url: string | null; avatar_seed: string | null }
      > = {};
      for (const row of (data ?? []) as Array<{
        id: string;
        avatar_url: string | null;
        avatar_seed: string | null;
      }>) {
        map[row.id] = {
          avatar_url: row.avatar_url ?? null,
          avatar_seed: row.avatar_seed ?? null,
        };
      }
      setProfileAvatarByUserId(map);
    } else {
      setProfileAvatarByUserId({});
    }
    setLoading(false);
  }, [currentOrganization?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const actionRequiredRows = useMemo(
    () => requests.filter((row) => row.status === "pending"),
    [requests],
  );
  const historyRows = useMemo(
    () => requests.filter((row) => row.status !== "pending"),
    [requests],
  );
  const visibleRows =
    activeTab === "action_required" ? actionRequiredRows : historyRows;
  const actionRequiredShared = useMemo(
    () => sharedNotifications.filter((n) => n.status === "open"),
    [sharedNotifications],
  );
  const historyShared = useMemo(
    () => sharedNotifications.filter((n) => n.status !== "open"),
    [sharedNotifications],
  );
  const visibleShared =
    activeTab === "action_required" ? actionRequiredShared : historyShared;
  const actionRequiredCount =
    actionRequiredRows.length + actionRequiredShared.length;
  const hasRows = visibleRows.length > 0 || visibleShared.length > 0;
  return (
    <View style={styles.root}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <LoadingIndicator size="large" color={Theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.pageWrap,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.shell, { paddingTop: insets.top + 8 }]}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => {
                    if (router.canGoBack()) router.back();
                    else router.replace("/(tabs)/finance");
                  }}
                >
                  <FontAwesome
                    name="arrow-left"
                    size={16}
                    color={Theme.textMuted}
                  />
                </TouchableOpacity>
                <View>
                  <Text style={styles.workspaceText}>QU. WORKSPACE</Text>
                  <Text style={styles.headerTitle}>Notifications</Text>
                  <Text style={styles.headerSubtitle}>
                    Driver requests and shared-ledger updates in one place.
                  </Text>
                </View>
              </View>

              <View style={styles.headerRight}>
                <Image
                  source={{ uri: "https://i.pravatar.cc/100?img=64" }}
                  style={styles.profileAvatar}
                />
              </View>
            </View>

            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={styles.tabBtn}
                onPress={() => setActiveTab("action_required")}
                activeOpacity={0.8}
              >
                <View style={styles.tabTextRow}>
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === "action_required" && styles.tabTextActive,
                    ]}
                  >
                    Action Required
                  </Text>
                  {actionRequiredCount > 0 ? (
                    <View style={styles.tabCountPill}>
                      <Text style={styles.tabCountText}>{actionRequiredCount}</Text>
                    </View>
                  ) : null}
                </View>
                {activeTab === "action_required" ? (
                  <View style={styles.tabUnderline} />
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tabBtn}
                onPress={() => setActiveTab("history")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "history" && styles.tabTextActive,
                  ]}
                >
                  History
                </Text>
                {activeTab === "history" ? (
                  <View style={styles.tabUnderline} />
                ) : null}
              </TouchableOpacity>
            </View>

            <View style={styles.listWrap}>
              {sharedLoadError ? (
                <View style={styles.warningCard}>
                  <FontAwesome
                    name="exclamation-circle"
                    size={13}
                    color={Theme.warning}
                  />
                  <Text style={styles.warningText}>
                    Shared ledger updates are temporarily unavailable.
                  </Text>
                </View>
              ) : null}
              {!hasRows ? (
                <View style={styles.emptyCard}>
                  <FontAwesome
                    name="bell-slash"
                    size={24}
                    color={Theme.textMuted}
                  />
                  <Text style={styles.emptyTitle}>All caught up</Text>
                  <Text style={styles.emptySubtitle}>
                    {activeTab === "history"
                      ? "No processed salary requests yet."
                      : "New driver payment requests will show up here."}
                  </Text>
                </View>
              ) : (
                <>
                  {visibleShared.length > 0 ? (
                    <Text style={styles.sectionLabel}>Shared ledger</Text>
                  ) : null}
                  {visibleShared.map((item) => {
                    const created = item.created_at
                      ? new Date(item.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                        })
                      : "";
                    const amountMeta =
                      item.amount_meta != null &&
                      Number.isFinite(item.amount_meta) &&
                      item.amount_meta > 0
                        ? `₹${Number(item.amount_meta).toLocaleString("en-IN")}`
                        : null;
                    const isActionRequired = item.status === "open";
                    const ctaLabel = sharedLedgerActionLabel(item.event_type);
                    const eventMeta = sharedLedgerEventMetaLabel(item.event_type);
                    return (
                      <View key={item.id} style={[styles.card, styles.sharedCard]}>
                        <View style={styles.row}>
                          <View style={styles.sharedAvatarWrap}>
                            <FontAwesome
                              name={sharedLedgerIcon(item.event_type)}
                              size={15}
                              color={Theme.primary}
                            />
                          </View>

                          <View style={styles.body}>
                            <Text style={styles.title} numberOfLines={1}>
                              <Text style={styles.driverName}>Shared ledger</Text>{" "}
                              {eventMeta}
                            </Text>
                            <View style={styles.metaRow}>
                              <View style={styles.metaPill}>
                                <FontAwesome
                                  name="link"
                                  size={10}
                                  color={Theme.primary}
                                />
                                <Text style={styles.metaPillText}>{eventMeta}</Text>
                              </View>
                              {created ? (
                                <View style={styles.dateInline}>
                                  <FontAwesome
                                    name="clock-o"
                                    size={10}
                                    color={Theme.textMuted}
                                  />
                                  <Text style={styles.metaDate}>{created}</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.sharedSubtitle} numberOfLines={1}>
                              {item.title}
                            </Text>
                            {item.subtitle ? (
                              <Text
                                style={styles.sharedSubtitleSecondary}
                                numberOfLines={2}
                              >
                                {item.subtitle}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.amountBlock}>
                            <Text style={styles.amountLabel}>AMOUNT</Text>
                            <Text style={styles.sharedAmount}>
                              {amountMeta ?? "—"}
                            </Text>
                          </View>

                          {isActionRequired ? (
                            <View style={styles.actions}>
                              <TouchableOpacity
                                style={[styles.actionBtn, styles.rejectBtn]}
                                onPress={async () => {
                                  const { error } =
                                    await markSharedLedgerNotificationRead(
                                      item.id,
                                      currentOrganization?.id ?? "",
                                    );
                                  if (error) {
                                    Alert.alert(
                                      "Could not update",
                                      error.message,
                                    );
                                    return;
                                  }
                                  setSharedNotifications((prev) =>
                                    prev.map((row) =>
                                      row.id === item.id
                                        ? {
                                            ...row,
                                            status: "read",
                                            read_at: new Date().toISOString(),
                                          }
                                        : row,
                                    ),
                                  );
                                }}
                                activeOpacity={0.82}
                              >
                                <FontAwesome
                                  name="check"
                                  size={12}
                                  color={Theme.textPrimaryDark}
                                />
                                <Text style={styles.rejectText}>Read</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.actionBtn, styles.payBtn]}
                                onPress={async () => {
                                  const payload = item.payload_json ?? {};
                                  const actionKind = resolveSharedActionKind(
                                    item.event_type,
                                    payload,
                                  );
                                  const tripId =
                                    typeof payload.trip_id === "string"
                                      ? payload.trip_id
                                      : null;
                                  const entityType =
                                    typeof payload.entity_type === "string"
                                      ? payload.entity_type.toUpperCase()
                                      : null;
                                  const entityId =
                                    typeof payload.entity_id === "string"
                                      ? payload.entity_id
                                      : null;

                                  if (entityType === "CLIENT" && entityId) {
                                    const q = new URLSearchParams({
                                      shared: "1",
                                      sharedAction: actionKind,
                                    });
                                    if (tripId) q.set("tripId", tripId);
                                    router.push(
                                      `/client/${entityId}?${q.toString()}` as const,
                                    );
                                  } else if (
                                    entityType === "SUPPLIER" &&
                                    entityId
                                  ) {
                                    const q = new URLSearchParams({
                                      shared: "1",
                                      sharedAction: actionKind,
                                    });
                                    if (tripId) q.set("tripId", tripId);
                                    router.push(
                                      `/supplier/${entityId}?${q.toString()}` as const,
                                    );
                                  } else if (tripId) {
                                    router.push(
                                      `/trip-ledger/${tripId}` as const,
                                    );
                                  } else {
                                    router.push("/(tabs)/finance");
                                  }

                                  if (item.status === "open") {
                                    const { error } =
                                      await markSharedLedgerNotificationRead(
                                        item.id,
                                        currentOrganization?.id ?? "",
                                      );
                                    if (error) {
                                      return;
                                    }
                                    setSharedNotifications((prev) =>
                                      prev.map((row) =>
                                        row.id === item.id
                                          ? {
                                              ...row,
                                              status: "read",
                                              read_at: new Date().toISOString(),
                                            }
                                          : row,
                                      ),
                                    );
                                  }
                                }}
                                activeOpacity={0.85}
                              >
                                <FontAwesome
                                  name="arrow-right"
                                  size={12}
                                  color={Theme.textOnPrimary}
                                />
                                <Text style={styles.payText}>{ctaLabel}</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={styles.historyFooter}>
                              <Text
                                style={[
                                  styles.historyStatus,
                                  item.status === "resolved"
                                    ? styles.historyStatusPaid
                                    : styles.historyStatusNeutral,
                                ]}
                              >
                                {item.status === "resolved"
                                  ? "Resolved"
                                  : item.status === "handled"
                                    ? "Handled"
                                    : "Read"}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}

                  {visibleRows.length > 0 ? (
                    <Text style={styles.sectionLabel}>Driver requests</Text>
                  ) : null}
                  {visibleRows.map((req) => {
                    const driverName = req.drivers?.name?.trim() || t("driver");
                    const typeLabel = requestTypeLabel(
                      t,
                      req.request_type ?? "",
                    );
                    const created = req.created_at
                      ? new Date(req.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                        })
                      : "";
                    const requestBusy = busyId === req.id;
                    const isTripBased =
                      req.request_type === "trip_based" &&
                      Array.isArray(req.trip_ids) &&
                      req.trip_ids.length > 0;
                    const isHistoryCard = req.status !== "pending";
                    const historyStatusLabel =
                      req.status === "paid"
                        ? "Paid"
                        : req.status === "approved"
                          ? "Approved"
                          : "Rejected";
                    const profileUserId = String(
                      req.drivers?.user_id ?? "",
                    ).trim();
                    const profileAvatar = profileAvatarByUserId[profileUserId];
                    const driverAvatarUrl =
                      resolveAvatarPublicUrl(profileAvatar?.avatar_url) ??
                      (profileAvatar?.avatar_url?.trim() || null);
                    const fallbackSeed =
                      (profileAvatar?.avatar_seed ?? "").trim() || "driver-1";
                    const driverAvatarUri =
                      driverAvatarUrl || getAvatarUriForSeed(fallbackSeed);

                    return (
                      <View key={req.id} style={styles.card}>
                        <View style={styles.driverCardHeader}>
                          <Image
                            source={{ uri: driverAvatarUri }}
                            style={styles.avatar}
                          />
                          <View style={styles.body}>
                            <Text style={styles.title} numberOfLines={2}>
                              <Text style={styles.driverName}>{driverName}</Text>{" "}
                              requested payment
                            </Text>
                            <View style={styles.metaRow}>
                              <View style={styles.metaPill}>
                                <FontAwesome
                                  name="map-marker"
                                  size={10}
                                  color={Theme.primary}
                                />
                                <Text style={styles.metaPillText}>
                                  {typeLabel}
                                </Text>
                              </View>
                              {created ? (
                                <View style={styles.dateInline}>
                                  <FontAwesome
                                    name="clock-o"
                                    size={10}
                                    color={Theme.textMuted}
                                  />
                                  <Text style={styles.metaDate}>{created}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </View>
                        <View style={styles.driverCardFooter}>
                          <View style={styles.amountBlock}>
                            <Text style={styles.amountLabel}>AMOUNT</Text>
                            <Text style={styles.amount}>
                              ₹{Number(req.amount ?? 0).toLocaleString("en-IN")}
                            </Text>
                          </View>
                          {isHistoryCard ? (
                            <View style={styles.historyFooter}>
                              <Text
                                style={[
                                  styles.historyStatus,
                                  req.status === "rejected"
                                    ? styles.historyStatusReject
                                    : styles.historyStatusPaid,
                                ]}
                              >
                                {historyStatusLabel}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.actions}>
                              <TouchableOpacity
                                style={[styles.actionBtn, styles.rejectBtn]}
                                disabled={requestBusy}
                                onPress={() => {
                                  Alert.alert(
                                    t("rejectRequest"),
                                    t("rejectRequestConfirm")
                                      .replace("{{name}}", driverName)
                                      .replace(
                                        "{{amount}}",
                                        Number(req.amount).toLocaleString(
                                          "en-IN",
                                        ),
                                      ),
                                    [
                                      { text: t("cancel"), style: "cancel" },
                                      {
                                        text: t("reject"),
                                        style: "destructive",
                                        onPress: async () => {
                                          setBusyId(req.id);
                                          const { error } =
                                            await updateSalaryRequestStatus(
                                              req.id,
                                              "rejected",
                                            );
                                          setBusyId(null);
                                          if (error) {
                                            Alert.alert(
                                              t("rejectFailed"),
                                              error.message,
                                            );
                                            return;
                                          }
                                          setRequests((prev) =>
                                            prev.map((row) =>
                                              row.id === req.id
                                                ? { ...row, status: "rejected" }
                                                : row,
                                            ),
                                          );
                                        },
                                      },
                                    ],
                                  );
                                }}
                              >
                                <FontAwesome
                                  name="close"
                                  size={11}
                                  color={Theme.textPrimaryDark}
                                />
                                <Text style={styles.rejectText}>{t("reject")}</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.actionBtn, styles.payBtn]}
                                disabled={requestBusy}
                                onPress={() => {
                                  const q = new URLSearchParams({
                                    entityType: "DRIVER",
                                    entityId: req.driver_id,
                                    partyName: driverName,
                                    partyId: req.driver_id,
                                    defaultType: "out",
                                    salaryAmount: String(req.amount),
                                    defaultDriverPaymentType: isTripBased
                                      ? "settlement"
                                      : "advance",
                                    salaryRequestId: req.id,
                                  });
                                  if (isTripBased && req.trip_ids[0]) {
                                    q.set("tripId", req.trip_ids[0]);
                                  }
                                  router.push(
                                    `/(modals)/ledger-sync?${q.toString()}` as const,
                                  );
                                }}
                              >
                                <FontAwesome
                                  name="check"
                                  size={11}
                                  color={Theme.textOnPrimary}
                                />
                                <Text style={styles.payText}>Pay now</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.moreBtn}
                                activeOpacity={0.75}
                              >
                                <FontAwesome
                                  name="ellipsis-v"
                                  size={12}
                                  color={Theme.textMuted}
                                />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.surface },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  pageWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  shell: {
    width: "100%",
    backgroundColor: Theme.screenBackground,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceText: {
    color: Theme.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  headerTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
  },
  headerSubtitle: { color: Theme.textSecondary, fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  escrowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  escrowIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  escrowLabel: {
    color: Theme.textSecondary,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  escrowValue: {
    color: Theme.textPrimaryDark,
    fontSize: 14,
    fontWeight: "800",
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  tabsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingTop: 10,
    paddingBottom: 8,
    marginRight: 24,
  },
  tabTextRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tabText: {
    color: Theme.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  tabTextActive: {
    color: Theme.primary,
    fontWeight: "700",
  },
  tabCountPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.fiscalTabActiveBg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabCountText: { color: Theme.primary, fontSize: 11, fontWeight: "700" },
  tabUnderline: {
    marginTop: 7,
    height: 2,
    borderRadius: 2,
    backgroundColor: Theme.primary,
  },
  listWrap: { padding: 12, gap: 8 },
  warningCard: {
    borderWidth: 1,
    borderColor: Theme.warning,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  warningText: {
    color: Theme.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
    minWidth: 0,
  },
  sectionLabel: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginTop: 4,
    marginBottom: 2,
  },
  sharedCard: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  sharedAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sharedSubtitle: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  sharedSubtitleSecondary: {
    color: Theme.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  sharedAmount: {
    color: Theme.textPrimaryDark,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.surfaceForm,
  },
  emptyTitle: { color: Theme.textPrimaryDark, fontWeight: "800", fontSize: 16 },
  emptySubtitle: {
    color: Theme.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  card: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 14,
    padding: 10,
    backgroundColor: Theme.screenBackground,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
  },
  driverCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
  },
  driverCardFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 10,
    width: "100%",
    gap: 8,
    flexWrap: "wrap",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: Theme.textSecondary, fontSize: 14, fontWeight: "500" },
  driverName: { fontWeight: "800", color: Theme.textPrimaryDark },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 8 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  metaPillText: { color: Theme.textSecondary, fontSize: 10, fontWeight: "600" },
  dateInline: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaDate: { color: Theme.textMuted, fontSize: 11, fontWeight: "500" },
  amountBlock: { alignItems: "flex-start", flexShrink: 0, paddingRight: 4 },
  amountLabel: {
    color: Theme.textSecondary,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  amount: {
    color: Theme.textPrimaryDark,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 26,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  actionBtn: {
    flexShrink: 0,
    minHeight: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: "row",
    gap: 4,
  },
  rejectBtn: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.border,
    minWidth: 68,
  },
  payBtn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
    minWidth: 82,
  },
  rejectText: { color: Theme.textPrimaryDark, fontSize: 11, fontWeight: "700" },
  payText: { color: Theme.textOnPrimary, fontSize: 11, fontWeight: "800" },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  historyFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexShrink: 0,
  },
  historyStatus: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
  },
  historyStatusPaid: {
    color: Theme.positive,
    backgroundColor: Theme.positiveMuted,
  },
  historyStatusReject: {
    color: Theme.negative,
    backgroundColor: Theme.negativeMuted,
  },
  historyStatusNeutral: {
    color: Theme.textSecondary,
    backgroundColor: Theme.surfaceLight,
  },
});
