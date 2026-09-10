/**
 * Pulse Invoice product landing — workspace entry only.
 * Zero data fetch. Does not query billing tables.
 * CTA is navigation-only (no entitlements, no invoice APIs).
 * Product chrome (brand / profile) comes from PulseProductShell.
 */
import { PulsePillButton } from "@/components/PulsePillButton";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export function PulseInvoiceLandingScreen() {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.tagline}>GST-compliant billing for this workspace.</Text>
        <Text style={styles.body}>
          Pulse Invoice is the workspace product for trip billing. Create an
          invoice from eligible trips in this workspace.
        </Text>
        <PulsePillButton
          label="Create Invoice"
          accessibilityLabel="Create Invoice"
          fullWidth
          onPress={() => router.push(ROUTES.INVOICING_EXECUTE)}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.spacingExtraLarge,
    backgroundColor: Theme.screenBackground,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: Layout.spacingExtraLarge,
    gap: Layout.spacingMedium,
    maxWidth: 560,
  },
  tagline: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    color: Theme.textSecondary,
    lineHeight: 20,
  },
  cta: {
    marginTop: Layout.spacingSmall,
  },
});
