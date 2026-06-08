/**
 * Ledger-style detail sections for alert detail — matches TripLedgerDetailScreen density.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatINR, formatLedgerDate, formatRelative } from "@/lib/format";
import { useLanguage } from "@/contexts/LanguageContext";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type AlertDetailEntryModel = {
  title: string;
  metaLine: string;
  routeLine?: string | null;
  amount: number;
  direction: "in" | "out";
};

export type AlertDetailLedgerModel = {
  typeLabel: string;
  entryDate: string;
  amountIn?: number | null;
  amountOut?: number | null;
  note?: string | null;
};

export type AlertDetailTripModel = {
  trip: TripRow;
  clientName: string;
  vehicleLabel?: string | null;
  driverName?: string | null;
  supplierCost: number;
  supplierPaid: number;
  supplierDue: number;
};

type AlertDetailLedgerSectionsProps = {
  entry: AlertDetailEntryModel;
  ledger: AlertDetailLedgerModel;
  trip?: AlertDetailTripModel | null;
  associatedTransactions?: LedgerRow[];
  onSelectTransaction?: (id: string) => void;
};

export function AlertDetailLedgerSections({
  entry,
  ledger,
  trip,
  associatedTransactions = [],
  onSelectTransaction,
}: AlertDetailLedgerSectionsProps) {
  const { t } = useLanguage();

  return (
    <View style={styles.wrap}>
      <View style={styles.entryCard}>
        <Text style={styles.entryCardTitle}>{entry.title}</Text>
        <View style={styles.entryCardRow}>
          <View style={styles.entryCardLeft}>
            <Text style={styles.entryCardMeta} numberOfLines={1}>
              {entry.metaLine}
            </Text>
          </View>
          {entry.routeLine ? (
            <View style={styles.entryCardCenter}>
              <Text style={styles.entryCardRoute} numberOfLines={1}>
                {entry.routeLine}
              </Text>
            </View>
          ) : null}
          <View style={styles.entryCardRight}>
            <Text
              style={[
                styles.entryCardAmount,
                entry.direction === "out" && styles.entryCardAmountRed,
                entry.direction === "in" && styles.entryCardAmountGreen,
              ]}
            >
              {formatINR(entry.amount)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.darkSection}>
        <Text style={styles.darkSectionTitle}>{t("ledgerDetails")}</Text>
        <View style={styles.detailBody}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t("type")}</Text>
            <Text style={styles.detailValue}>{ledger.typeLabel}</Text>
          </View>
          <View style={[styles.detailRow, styles.detailRowWithAging]}>
            <View>
              <Text style={styles.detailLabel}>{t("entryDate")}</Text>
              <Text style={styles.detailValue}>
                {formatLedgerDate(ledger.entryDate)}
              </Text>
            </View>
            <Text style={styles.agingText}>{formatRelative(ledger.entryDate)}</Text>
          </View>
          {ledger.amountIn != null && Number(ledger.amountIn) > 0 ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("amountReceived")}</Text>
              <Text style={[styles.detailValue, styles.detailValueGreen]}>
                {formatINR(ledger.amountIn)}
              </Text>
            </View>
          ) : null}
          {ledger.amountOut != null && Number(ledger.amountOut) > 0 ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("amountPaid")}</Text>
              <View style={styles.amountPaidPill}>
                <Text style={styles.amountPaidPillText}>
                  {formatINR(ledger.amountOut)}
                </Text>
              </View>
            </View>
          ) : null}
          {ledger.note?.trim() ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("note")}</Text>
              <Text style={styles.detailValue} numberOfLines={3}>
                {ledger.note}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {trip ? (
        <>
          <View style={styles.darkSection}>
            <Text style={styles.darkSectionTitle}>{t("associatedTrip")}</Text>
            <View style={styles.detailBody}>
              <View style={styles.twoColRow}>
                <View style={styles.twoColItem}>
                  <Text style={styles.detailLabel}>{t("trip")}</Text>
                  <Text style={styles.detailValue}>
                    {getTripDisplayNumber(trip.trip)}
                  </Text>
                </View>
                <View style={styles.twoColItem}>
                  <Text style={styles.detailLabel}>{t("tripDate")}</Text>
                  <Text style={styles.detailValue}>
                    {formatLedgerDate(
                      trip.trip.pickup_date ?? trip.trip.created_at ?? "",
                    )}
                  </Text>
                </View>
              </View>
              <View style={styles.twoColRow}>
                <View style={styles.twoColItem}>
                  <Text style={styles.detailLabel}>{t("route")}</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {trip.trip.pickup_area ?? "—"} → {trip.trip.drop_location ?? "—"}
                  </Text>
                </View>
                <View style={styles.twoColItem}>
                  <Text style={styles.detailLabel}>{t("client")}</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {trip.clientName}
                  </Text>
                </View>
              </View>
              {(trip.vehicleLabel?.trim() || trip.driverName?.trim()) ? (
                <View style={styles.twoColRow}>
                  {trip.vehicleLabel?.trim() ? (
                    <View style={styles.twoColItem}>
                      <Text style={styles.detailLabel}>{t("truck")}</Text>
                      <Text style={styles.detailValue} numberOfLines={1}>
                        {trip.vehicleLabel.trim()}
                      </Text>
                    </View>
                  ) : null}
                  {trip.driverName?.trim() ? (
                    <View style={styles.twoColItem}>
                      <Text style={styles.detailLabel}>{t("driver")}</Text>
                      <Text style={styles.detailValue} numberOfLines={1}>
                        {trip.driverName.trim()}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCardRow}>
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardLabel}>{t("supplierCost")}</Text>
                <Text style={styles.summaryCardValue}>
                  {formatINR(trip.supplierCost)}
                </Text>
              </View>
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardLabel}>{t("paid")}</Text>
                <Text
                  style={[styles.summaryCardValue, styles.summaryCardValueGreen]}
                >
                  {formatINR(trip.supplierPaid)}
                </Text>
              </View>
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardLabel}>{t("due")}</Text>
                <Text
                  style={[styles.summaryCardValue, styles.summaryCardValueRed]}
                >
                  {formatINR(trip.supplierDue)}
                </Text>
              </View>
            </View>
          </View>
        </>
      ) : null}

      {associatedTransactions.length > 0 ? (
        <>
          <Text style={styles.associatedLabel}>{t("associatedTransactions")}</Text>
          {associatedTransactions.map((tx) => {
            const typeLabel =
              getDoubleEntryDisplayLabel(tx) ?? tx.description ?? "ENTRY";
            const dateStr = formatLedgerDate(
              tx.transaction_date ?? tx.created_at ?? "",
            );
            const outAmt = Number(tx.amount_out ?? 0);
            const inAmt = Number(tx.amount_in ?? 0);
            return (
              <TouchableOpacity
                key={tx.id}
                style={styles.associatedCard}
                onPress={() => onSelectTransaction?.(tx.id)}
                activeOpacity={onSelectTransaction ? 0.8 : 1}
                disabled={!onSelectTransaction}
              >
                <Text style={styles.associatedCardLine1}>
                  {dateStr} · {typeLabel}
                </Text>
                <Text
                  style={[
                    styles.associatedCardLine2,
                    outAmt > 0 && styles.associatedCardOut,
                    inAmt > 0 && outAmt === 0 && styles.associatedCardIn,
                  ]}
                  numberOfLines={2}
                >
                  {outAmt > 0
                    ? `${formatINR(outAmt)} out`
                    : inAmt > 0
                      ? `${formatINR(inAmt)} in`
                      : "—"}{" "}
                  · {tx.description ?? "ENTRY"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  entryCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  entryCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
    textTransform: "capitalize",
  },
  entryCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  entryCardLeft: { flex: 1, minWidth: 0 },
  entryCardCenter: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  entryCardRight: {
    flex: 0.8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  entryCardMeta: {
    fontSize: 9,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  entryCardRoute: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  entryCardAmount: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  entryCardAmountGreen: { color: Theme.darkGreen },
  entryCardAmountRed: { color: Theme.teslaRed },
  darkSection: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    marginBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginHorizontal: -Layout.screenPaddingHorizontal,
  },
  darkSectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.darkBackground,
    textTransform: "uppercase",
  },
  detailBody: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  detailRowWithAging: { alignItems: "center" },
  detailLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  detailValue: { fontSize: 10, fontWeight: "600", color: Theme.textPrimaryDark },
  detailValueGreen: { color: Theme.darkGreen },
  agingText: { fontSize: 9, color: Theme.textMuted, marginTop: 12 },
  amountPaidPill: {
    backgroundColor: Theme.teslaRed,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  amountPaidPillText: { fontSize: 10, fontWeight: "700", color: Theme.textOnDark },
  twoColRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 10,
  },
  twoColItem: { flex: 1, minWidth: 0 },
  summaryCard: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 6,
    marginBottom: 8,
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  summaryCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryCardItem: { flex: 1, alignItems: "center" },
  summaryCardLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  summaryCardValue: { fontSize: 11, fontWeight: "700", color: Theme.textOnDark },
  summaryCardValueGreen: { color: Theme.darkGreen },
  summaryCardValueRed: { color: Theme.teslaRed },
  associatedLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  associatedCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  associatedCardLine1: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  associatedCardLine2: { fontSize: 10, color: Theme.textMuted },
  associatedCardOut: { color: Theme.teslaRed },
  associatedCardIn: { color: Theme.darkGreen },
});
