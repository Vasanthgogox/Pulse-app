/**
 * Create Invoice call-to-action on Pending Billing.
 * Draft form opens on a dedicated page — not embedded here.
 */
import { PulsePillButton } from "@/components/PulsePillButton";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { FileText } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

export function InvoiceCreateCtaPanel({
  selectedCount,
  partnerLabel,
  blockedReason,
  onCreate,
}: {
  selectedCount: number;
  partnerLabel?: string | null;
  blockedReason?: string | null;
  onCreate: () => void;
}) {
  const disabled = selectedCount === 0 || Boolean(blockedReason);
  const summary =
    selectedCount === 0
      ? "Select one or more eligible trips, then create the invoice on a full page."
      : partnerLabel
        ? `${selectedCount} trip${selectedCount === 1 ? "" : "s"} selected for ${partnerLabel}.`
        : `${selectedCount} trip${selectedCount === 1 ? "" : "s"} selected.`;

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <FileText size={22} color={Theme.analyticsHeroBg} strokeWidth={2} />
        </View>
        <Text style={styles.title}>GST-compliant billing for this workspace.</Text>
        <Text style={styles.body}>
          Pulse Invoice builds a draft from your selected trips. Review customer,
          transport, and line items on a dedicated page before you issue.
        </Text>
        <Text style={styles.summary}>{summary}</Text>
        {blockedReason ? (
          <Text style={styles.blocked}>{blockedReason}</Text>
        ) : null}
        <PulsePillButton
          label={
            selectedCount > 0
              ? `Create Invoice (${selectedCount})`
              : "Create Invoice"
          }
          accessibilityLabel={
            blockedReason
              ? blockedReason
              : selectedCount > 0
                ? `Create Invoice with ${selectedCount} trips`
                : "Create Invoice"
          }
          fullWidth
          showPlusIcon
          disabled={disabled}
          onPress={disabled ? undefined : onCreate}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.analyticsCanvas,
    padding: 20,
    justifyContent: "center",
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: Layout.spacingMedium,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 20,
  },
  summary: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.analyticsHeroBg,
    lineHeight: 18,
    marginTop: 4,
  },
  blocked: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.warning,
    lineHeight: 17,
  },
  cta: {
    marginTop: Layout.spacingSmall,
  },
});
