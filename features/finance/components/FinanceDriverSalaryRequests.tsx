import FontAwesome from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { styles } from "./FinanceScreen.styles";
import type { SalaryRequestWithDriverRow } from "@/services/salaryRequestsService";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { updateSalaryRequestStatus } from "@/services/salaryRequestsService";
import { useRouter } from "expo-router";
import type { TripRow } from "@/features/trips/services/trips.service";

export interface FinanceDriverSalaryRequestsProps {
  requests: SalaryRequestWithDriverRow[];
  driverRows: DriverRow[];
  formatDate: (iso: string) => string;
  /** Optional: trip lookup by id so trip_based cards can show route + date. */
  tripById?: Record<string, TripRow>;
  onPayRequest: (
    requestId: string,
    driver: DriverRow,
    typeLabel: string,
    amount: number,
  ) => void;
  onRejectRequest: (requestId: string) => void;
}

export function FinanceDriverSalaryRequests({
  requests,
  driverRows,
  formatDate,
  tripById = {},
  onPayRequest,
  onRejectRequest,
}: FinanceDriverSalaryRequestsProps) {
  const { t } = useLanguage();
  const router = useRouter();
  if (requests.length === 0) return null;
  return (
    <View style={styles.driverSalaryRequestsBlock}>
      <Text style={styles.driverSalaryRequestsTitle}>
        {t("requestsFromDrivers")}
      </Text>
      <Text style={styles.driverSalaryRequestsSubtitle}>
        {t("payOrRejectSalaryRequests")}
      </Text>
      {requests.map((req) => {
        const driverName =
          req.drivers?.name?.trim() ||
          driverRows.find((d) => d.id === req.driver_id)?.name ||
          t("driver");
        const typeLabel =
          req.request_type === "monthly"
            ? t("monthlySalary")
            : req.request_type === "advance"
              ? t("advance")
              : t("tripBased");
        const salaryMonthStr =
          req.request_type === "monthly" && req.salary_month
            ? (() => {
                const d = new Date(req.salary_month);
                return d.toLocaleDateString("en-IN", {
                  month: "short",
                  year: "numeric",
                });
              })()
            : null;
        const dateStr = req.created_at ? formatDate(req.created_at) : "";

        // For trip_based: resolve trip details from tripById lookup
        const isTripBased = req.request_type === "trip_based";
        const linkedTripIds: string[] = Array.isArray(req.trip_ids) ? req.trip_ids : [];
        const linkedTrips = linkedTripIds.map((id) => tripById[id]).filter(Boolean) as TripRow[];
        const firstTrip = linkedTrips[0] ?? null;
        const tripRoute = firstTrip
          ? (() => {
              const from = (firstTrip.pickup_area ?? (firstTrip as unknown as Record<string, string>).from_location ?? "").trim();
              const to = (firstTrip.drop_location ?? (firstTrip as unknown as Record<string, string>).to_location ?? "").trim();
              return from && to ? `${from} → ${to}` : from || to || null;
            })()
          : null;
        const tripDateRaw = firstTrip
          ? (firstTrip.pickup_date ?? firstTrip.started_at ?? firstTrip.created_at ?? "")
          : "";
        const tripDateStr = tripDateRaw
          ? new Date(tripDateRaw).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
          : "";

        return (
          <View key={req.id} style={styles.driverSalaryRequestCard}>
            <View style={styles.driverSalaryRequestCardMain}>
              <Text
                style={styles.driverSalaryRequestDriverName}
                numberOfLines={1}
              >
                {driverName}
              </Text>
              <Text
                style={styles.driverSalaryRequestMeta}
                numberOfLines={1}
              >
                {typeLabel}
                {salaryMonthStr ? ` · ${salaryMonthStr}` : ""}
                {dateStr ? ` · ${dateStr}` : ""}
              </Text>
              {isTripBased && linkedTripIds.length > 0 ? (
                <View style={localStyles.tripInfoBand}>
                  <FontAwesome name="road" size={11} color={Theme.primary} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {tripRoute ? (
                      <Text style={localStyles.tripInfoRoute} numberOfLines={1}>{tripRoute}</Text>
                    ) : null}
                    <Text style={localStyles.tripInfoMeta}>
                      {linkedTripIds.length} trip{linkedTripIds.length !== 1 ? "s" : ""}
                      {tripDateStr ? ` · ${tripDateStr}` : ""}
                    </Text>
                  </View>
                  {firstTrip ? (
                    <TouchableOpacity
                      style={localStyles.tripViewBtn}
                      onPress={() => router.push(`/trip/${firstTrip.id}` as import("expo-router").Href)}
                      activeOpacity={0.75}
                      accessibilityLabel="View trip details"
                    >
                      <FontAwesome name="chevron-right" size={11} color={Theme.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {req.note?.trim() ? (
                <Text
                  style={styles.driverSalaryRequestNote}
                  numberOfLines={2}
                >
                  {req.note.trim()}
                </Text>
              ) : null}
              <View style={styles.driverSalaryRequestAmountRow}>
                <Text style={styles.driverSalaryRequestAmount}>
                  ₹{Number(req.amount).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
            <View style={styles.driverSalaryRequestActions}>
              <TouchableOpacity
                style={[
                  styles.driverSalaryRequestBtn,
                  styles.driverSalaryRequestBtnPay,
                ]}
                onPress={() => {
                  const driver = driverRows.find((d) => d.id === req.driver_id);
                  if (!driver) {
                    Alert.alert(
                      t("driverNotFound"),
                      t("driverRemovedHint"),
                    );
                    return;
                  }
                  onPayRequest(req.id, driver, typeLabel, Number(req.amount));
                }}
                accessibilityLabel={t("payThisRequest")}
              >
                <FontAwesome
                  name="rupee"
                  size={14}
                  color={Theme.textOnPrimary}
                />
                <Text style={styles.driverSalaryRequestBtnPayText}>
                  {t("pay")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.driverSalaryRequestBtn,
                  styles.driverSalaryRequestBtnReject,
                ]}
                onPress={() => {
                  Alert.alert(
                    t("rejectRequest"),
                    t("rejectRequestConfirm")
                      .replace("{{name}}", driverName)
                      .replace("{{amount}}", Number(req.amount).toLocaleString("en-IN")),
                    [
                      { text: t("cancel"), style: "cancel" },
                      {
                        text: t("reject"),
                        style: "destructive",
                        onPress: async () => {
                          const { error } = await updateSalaryRequestStatus(
                            req.id,
                            "rejected",
                          );
                          if (error) {
                            Alert.alert(
                              t("rejectFailed"),
                              error.message,
                            );
                            return;
                          }
                          onRejectRequest(req.id);
                        },
                      },
                    ],
                  );
                }}
                accessibilityLabel={t("rejectThisRequest")}
              >
                <Text style={styles.driverSalaryRequestBtnRejectText}>
                  {t("reject")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const localStyles = StyleSheet.create({
  tripInfoBand: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#bfdbfe",
  },
  tripInfoRoute: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: 16,
  },
  tripInfoMeta: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 1,
  },
  tripViewBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    alignSelf: "center",
  },
});
