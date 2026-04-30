import { TeslaHeader } from "@/components/TeslaHeader";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    getSalaryRequestsByOrganization,
    updateSalaryRequestStatus,
    type SalaryRequestWithDriverRow,
} from "@/services/salaryRequestsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<SalaryRequestWithDriverRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const orgId = currentOrganization?.id ?? "";
    if (!orgId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { requests: rows } = await getSalaryRequestsByOrganization(
      orgId,
      "pending",
    );
    setRequests(rows);
    setLoading(false);
  }, [currentOrganization?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const hasRows = requests.length > 0;
  const subtitle = useMemo(
    () =>
      hasRows
        ? "Driver salary requests need your action."
        : "No pending payment requests.",
    [hasRows],
  );

  return (
    <View style={styles.root}>
      <TeslaHeader
        title="Notifications"
        subtitle={subtitle}
        variant="default"
        showBack
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/finance");
        }}
        hideLogoBadge
        hideNotificationBell
        titleTextStyle={styles.headerTitle}
        subtitleTextStyle={styles.headerSubtitle}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {!hasRows ? (
            <View style={styles.emptyCard}>
              <FontAwesome name="bell-slash" size={24} color={Theme.textMuted} />
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptySubtitle}>
                New driver payment requests will show up here.
              </Text>
            </View>
          ) : (
            requests.map((req) => {
              const driverName =
                req.drivers?.name?.trim() || t("driver");
              const typeLabel = requestTypeLabel(t, req.request_type ?? "");
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

              return (
                <View key={req.id} style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.iconWrap}>
                      <FontAwesome
                        name="money"
                        size={14}
                        color={Theme.primary}
                      />
                    </View>
                    <View style={styles.body}>
                      <Text style={styles.title} numberOfLines={1}>
                        {driverName} requested payment
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {typeLabel}
                        {created ? ` · ${created}` : ""}
                      </Text>
                      {req.note?.trim() ? (
                        <Text style={styles.note} numberOfLines={2}>
                          {req.note.trim()}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.amount}>
                      ₹{Number(req.amount ?? 0).toLocaleString("en-IN")}
                    </Text>
                  </View>

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
                              Number(req.amount).toLocaleString("en-IN"),
                            ),
                          [
                            { text: t("cancel"), style: "cancel" },
                            {
                              text: t("reject"),
                              style: "destructive",
                              onPress: async () => {
                                setBusyId(req.id);
                                const { error } = await updateSalaryRequestStatus(
                                  req.id,
                                  "rejected",
                                );
                                setBusyId(null);
                                if (error) {
                                  Alert.alert(t("rejectFailed"), error.message);
                                  return;
                                }
                                setRequests((prev) =>
                                  prev.filter((row) => row.id !== req.id),
                                );
                              },
                            },
                          ],
                        );
                      }}
                    >
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
                        router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
                      }}
                    >
                      <Text style={styles.payText}>Pay now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground },
  headerTitle: { fontSize: 8.5 },
  headerSubtitle: { fontSize: 8 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
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
    borderColor: Theme.borderLight,
    borderRadius: 16,
    padding: 12,
    backgroundColor: Theme.screenBackground,
    gap: 10,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: Theme.textPrimaryDark, fontSize: 14, fontWeight: "700" },
  meta: { color: Theme.textMuted, fontSize: 11, marginTop: 2 },
  note: { color: Theme.textSecondary, fontSize: 12, marginTop: 4 },
  amount: { color: Theme.textPrimaryDark, fontSize: 13, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  rejectBtn: { backgroundColor: Theme.screenBackground, borderColor: Theme.border },
  payBtn: { backgroundColor: Theme.textPrimaryDark, borderColor: Theme.textPrimaryDark },
  rejectText: { color: Theme.textPrimaryDark, fontSize: 12, fontWeight: "700" },
  payText: { color: Theme.textOnPrimary, fontSize: 12, fontWeight: "800" },
});
