import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { FinanceProWorkspaceFrame } from "./FinanceProWorkspaceFrame";
import { formatFinanceInr } from "./financeProFormat";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function FinanceProCashLaunchScreen() {
  const router = useRouter();
  return (
    <FinanceProWorkspaceFrame
      title="Cash"
      subtitle="Attributed receipts are customer-linked trip cash. Cash activity lives on the Core transaction ledger — not invoice collection."
    >
      {(model) => (
        <View>
          <Text style={styles.kicker}>Attributed receipts</Text>
          <Text style={styles.value}>
            {formatFinanceInr(model.attributedReceipts)}
          </Text>
          <Text style={styles.note}>
            Billed {formatFinanceInr(model.billed)} − outstanding{" "}
            {formatFinanceInr(model.outstanding)}.
          </Text>
          <Pressable
            style={styles.cta}
            onPress={() => router.push(ROUTES.TABS.FINANCE)}
            accessibilityRole="button"
            accessibilityLabel="Open cash activity"
          >
            <Text style={styles.ctaText}>Open cash activity</Text>
          </Pressable>
        </View>
      )}
    </FinanceProWorkspaceFrame>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  value: {
    fontSize: 32,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimary,
    marginTop: 4,
  },
  note: {
    marginTop: 8,
    fontSize: 13,
    color: Theme.textSecondary,
  },
  cta: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: Theme.primary,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 8,
  },
  ctaText: {
    color: Theme.screenBackground,
    fontWeight: "800",
    fontSize: 14,
  },
});
