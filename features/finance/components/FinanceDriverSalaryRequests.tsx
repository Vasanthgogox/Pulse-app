import FontAwesome from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { styles } from "./FinanceScreen.styles";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salary-requests.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { updateSalaryRequestStatus } from "@/features/drivers/services/salary-requests.service";

export interface FinanceDriverSalaryRequestsProps {
  requests: SalaryRequestWithDriverRow[];
  driverRows: DriverRow[];
  formatDate: (iso: string) => string;
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
  onPayRequest,
  onRejectRequest,
}: FinanceDriverSalaryRequestsProps) {
  const { t } = useLanguage();
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
