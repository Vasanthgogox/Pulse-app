/**
 * Ledger payment detail table — columns: Date | Party/Description | Received | Paid.
 * Used below the Supplier Cost card on trip detail (ledger-associated layout).
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { StyleSheet, Text, View } from "react-native";
import { getDoubleEntryDisplayLabel } from "../accounting/accountingModel";

function formatLedgerDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = (s ?? "").slice(0, 10);
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${day} ${months[Number(m) - 1] ?? m} ${y}`;
}

function formatINR(n: number): string {
  if (n <= 0) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

export interface LedgerPaymentDetailTableProps {
  entries: LedgerRow[];
}

export function LedgerPaymentDetailTable({ entries }: LedgerPaymentDetailTableProps) {
  const { t } = useLanguage();

  if (entries.length === 0) {
    return null;
  }

  return (
    <View style={styles.tableWrap}>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, styles.thDate]} numberOfLines={1}>
          {t("date")}
        </Text>
        <Text style={[styles.th, styles.thParty]} numberOfLines={1}>
          {t("partyItem")}
        </Text>
        <Text style={[styles.th, styles.thAmount]} numberOfLines={1}>
          {t("cashIn")}
        </Text>
        <Text style={[styles.th, styles.thAmount]} numberOfLines={1}>
          {t("cashOut")}
        </Text>
      </View>
      {entries.map((row) => {
        const dateStr = formatLedgerDate(row.transaction_date ?? row.created_at);
        const partyDesc = getDoubleEntryDisplayLabel(row) ?? row.description ?? row.party_name ?? "—";
        const inAmt = Number(row.amount_in ?? 0);
        const outAmt = Number(row.amount_out ?? 0);
        return (
          <View key={row.id} style={styles.tableRow}>
            <Text style={styles.tdDate} numberOfLines={1}>
              {dateStr}
            </Text>
            <Text style={styles.tdParty} numberOfLines={2}>
              {partyDesc}
            </Text>
            <Text
              style={[styles.tdAmount, inAmt > 0 && styles.tdGreen]}
              numberOfLines={1}
            >
              {inAmt > 0 ? formatINR(inAmt) : "—"}
            </Text>
            <Text
              style={[styles.tdAmount, outAmt > 0 && styles.tdRed]}
              numberOfLines={1}
            >
              {outAmt > 0 ? formatINR(outAmt) : "—"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  thDate: { flex: 0.22, minWidth: 0 },
  thParty: { flex: 0.4, minWidth: 0 },
  thAmount: { flex: 0.19, minWidth: 0, textAlign: "right" as const },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  tdDate: {
    flex: 0.22,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  tdParty: {
    flex: 0.4,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  tdAmount: {
    flex: 0.19,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right" as const,
    color: Theme.textPrimaryDark,
  },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
});
