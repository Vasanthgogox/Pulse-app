import Theme from "@/constants/Theme";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

function formatLedgerDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const mi = Number(m);
  if (!y || !day || !Number.isFinite(mi) || mi < 1 || mi > 12) return "—";
  return `${day} ${months[mi - 1]} ${y}`;
}

function previewTitle(tx: LedgerRow): string {
  const label = getDoubleEntryDisplayLabel(tx);
  if (label) return label;
  const desc = tx.description?.trim();
  if (desc) return desc;
  if (Number(tx.amount_in ?? 0) > 0 && tx.contact_type === "client") {
    return "Customer payment";
  }
  if (Number(tx.amount_out ?? 0) > 0 && tx.contact_type === "supplier") {
    return "Supplier payment";
  }
  if (Number(tx.amount_out ?? 0) > 0 && tx.contact_type === "driver") {
    return "Driver payment";
  }
  return Number(tx.amount_in ?? 0) > 0 ? "Cash in" : "Cash out";
}

export function TripLedgerTransactionPreviewModal({
  visible,
  transaction,
  onClose,
  onViewAll,
}: {
  visible: boolean;
  transaction: LedgerRow | null;
  onClose: () => void;
  onViewAll?: () => void;
}) {
  if (!visible || !transaction) return null;

  const inAmt = Number(transaction.amount_in ?? 0);
  const outAmt = Number(transaction.amount_out ?? 0);
  const amount = inAmt > 0 ? inAmt : outAmt;
  const isIn = inAmt > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Transaction</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <FontAwesome name="times" size={16} color={Theme.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.headline}>{previewTitle(transaction)}</Text>
            <Text
              style={[
                styles.amount,
                isIn ? styles.amountIn : styles.amountOut,
              ]}
            >
              {isIn ? "+" : "−"}
              {formatINR(amount)}
            </Text>

            <View style={styles.row}>
              <Text style={styles.label}>Date</Text>
              <Text style={styles.value}>
                {formatLedgerDate(
                  transaction.transaction_date ?? transaction.created_at,
                )}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Payment mode</Text>
              <Text style={styles.value}>
                {transaction.payment_mode?.trim() || "—"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Reference</Text>
              <Text style={styles.value}>
                {transaction.payment_reference?.trim() || "—"}
              </Text>
            </View>
            {transaction.description?.trim() ? (
              <View style={styles.row}>
                <Text style={styles.label}>Note</Text>
                <Text style={[styles.value, styles.valueMultiline]}>
                  {transaction.description.trim()}
                </Text>
              </View>
            ) : null}
          </View>

          {onViewAll ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={onClose}
              activeOpacity={0.88}
            >
              <Text style={styles.secondaryBtnText}>Close</Text>
            </TouchableOpacity>
          ) : null}
          {onViewAll ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                onClose();
                onViewAll();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryBtnText}>View all on trip</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={onClose}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    gap: 10,
  },
  headline: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  amount: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
  },
  amountIn: {
    color: Theme.positive,
  },
  amountOut: {
    color: Theme.negative,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  value: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  valueMultiline: {
    lineHeight: 17,
  },
  primaryBtn: {
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.buttonDarkText,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});
