import { Text, TouchableOpacity, View } from "react-native";
import { useLanguage } from "@/contexts/LanguageContext";
import type { LedgerSortKey } from "../hooks/useFinanceLedger";
import type { FinanceSubTab } from "../types";
import { styles } from "./FinanceScreen.styles";

const LAST_COL_KEY: Record<FinanceSubTab, string> = {
  customers: "due",
  suppliers: "due",
  garage: "profit",
  drivers: "due",
  cash: "due",
};

export interface FinanceTableHeaderProps {
  financeSubTab: FinanceSubTab;
  ledgerSortKey: LedgerSortKey;
  ledgerSortDir: "asc" | "desc";
  onLedgerSortEntity: () => void;
  onLedgerSortSource: () => void;
  onLedgerSortCashIn: () => void;
  onLedgerSortCashOut: () => void;
}

export function FinanceTableHeader({
  financeSubTab,
  ledgerSortKey,
  ledgerSortDir,
  onLedgerSortEntity,
  onLedgerSortSource,
  onLedgerSortCashIn,
  onLedgerSortCashOut,
}: FinanceTableHeaderProps) {
  const { t } = useLanguage();
  const tab: FinanceSubTab = financeSubTab;
  const isCustomers = tab === "customers";
  const isSuppliers = tab === "suppliers";
  const isDrivers = tab === "drivers";
  const isLedger = false;
  return (
    <View style={styles.tableHeaderWrap}>
      <View style={styles.tableHeader}>
        {isDrivers ? (
          <>
            <Text style={[styles.th, styles.thDriverNode]} numberOfLines={1}>
              {t("driver").toUpperCase()}
            </Text>
            <Text
              style={[styles.th, styles.thCenter, styles.thDriverTrips, styles.thBorderLeft]}
              numberOfLines={1}
            >
              {t("headerTrips")}
            </Text>
            <Text
              style={[styles.th, styles.thRight, styles.thDriverEarnings, styles.thBorderLeft]}
              numberOfLines={1}
            >
              {t("earnings")}
            </Text>
            <Text
              style={[styles.th, styles.thRight, styles.thDriverPaid, styles.thBorderLeft]}
              numberOfLines={1}
            >
              {t("paid")}
            </Text>
            <Text
              style={[styles.th, styles.thRight, styles.thDriverDue, styles.thBorderLeft]}
              numberOfLines={1}
            >
              {t("due")}
            </Text>
          </>
        ) : (
          <>
            {isLedger ? (
              <TouchableOpacity
                style={[styles.thNode]}
                onPress={onLedgerSortEntity}
                hitSlop={8}
                accessibilityLabel={t("partyItem")}
                accessibilityRole="button"
              >
                <Text style={styles.thText} numberOfLines={1}>
                  {t("partyItem")}
                  {ledgerSortKey === "entity"
                    ? ledgerSortDir === "desc"
                      ? " ↓"
                      : " ↑"
                    : ""}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text
                style={[
                  styles.th,
                  (financeSubTab === "customers" || financeSubTab === "suppliers")
                    ? styles.thNodeCust
                    : styles.thNode,
                ]}
                numberOfLines={1}
              >
                {isDrivers
                  ? t("driver").toUpperCase()
                  : t("partyItem")}
              </Text>
            )}
            {isLedger ? (
              <TouchableOpacity
                style={[
                  styles.th,
                  styles.thCenterView,
                  styles.thMission,
                  styles.thBorderLeft,
                ]}
                onPress={onLedgerSortSource}
                hitSlop={8}
                accessibilityLabel={t("tripRoute")}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.thText, styles.thCenter]}
                  numberOfLines={1}
                >
                  {t("tripRoute")}
                  {ledgerSortKey === "source"
                    ? ledgerSortDir === "desc"
                      ? " ↓"
                      : " ↑"
                    : ""}
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                {(isCustomers ||
                  isSuppliers) && (
                  <Text
                    style={[
                      styles.th,
                      styles.thCenter,
                      styles.thTripsCust,
                      styles.thBorderLeft,
                    ]}
                    numberOfLines={1}
                  >
                    {t("headerTrips")}
                  </Text>
                )}
                <Text
                    style={[
                      styles.th,
                      styles.thCenter,
                    (financeSubTab === "customers" || financeSubTab === "suppliers")
                      ? styles.thMissionCust
                      : styles.thMission,
                    styles.thBorderLeft,
                    ]}
                  numberOfLines={1}
                >
                  {isCustomers
                    ? t("sales")
                    : isSuppliers
                      ? t("cost")
                      : isDrivers
                        ? t("status").toUpperCase()
                        : t("tripRoute")}
                </Text>
              </>
            )}
            {isLedger ? (
              <TouchableOpacity
                style={[
                  styles.thCol,
                  styles.thColLedgerAmount,
                  styles.thWithFilter,
                  styles.thBorderLeft,
                ]}
                onPress={onLedgerSortCashIn}
                hitSlop={8}
                accessibilityLabel={t("cashIn")}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.thText, styles.thRight]}
                  numberOfLines={1}
                >
                  {t("cashIn")}
                  {ledgerSortKey === "cash_in"
                    ? ledgerSortDir === "desc"
                      ? " ↓"
                      : " ↑"
                    : ""}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text
                style={[
                  styles.th,
                  styles.thRight,
                  (financeSubTab === "customers" || financeSubTab === "suppliers")
                    ? styles.thCreditCust
                    : styles.thCredit,
                  styles.thBorderLeft,
                ]}
                numberOfLines={1}
              >
                {isCustomers
                  ? t("got")
                  : isSuppliers
                    ? t("paid")
                    : isDrivers
                      ? t("toPay")
                      : t("sales")}
              </Text>
            )}
            {isLedger ? (
              <TouchableOpacity
                style={[
                  styles.thCol,
                  styles.thColLedgerAmount,
                  styles.thWithFilter,
                  styles.thBorderLeft,
                ]}
                onPress={onLedgerSortCashOut}
                hitSlop={8}
                accessibilityLabel={t("cashOut")}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.thText, styles.thRight]}
                  numberOfLines={1}
                >
                  {t("cashOut")}
                  {ledgerSortKey === "cash_out"
                    ? ledgerSortDir === "desc"
                      ? " ↓"
                      : " ↑"
                    : ""}
                </Text>
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  styles.thCol,
                  styles.thWithFilter,
                  (financeSubTab === "customers" || financeSubTab === "suppliers")
                    ? styles.thDebitCust
                    : styles.thDebit,
                  styles.thBorderLeft,
                ]}
              >
                <Text style={styles.thText} numberOfLines={1}>
                  {t(LAST_COL_KEY[tab])}
                </Text>
              </View>
            )}
            {isLedger && (
              <View style={styles.thLedgerSpacer} />
            )}
          </>
        )}
      </View>
    </View>
  );
}
