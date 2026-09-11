/**
 * Pulse Finance Pro — Command / Collections / Pipeline / Intelligence / Invoice / Cash.
 * Nested client, trip, invoice, and cash routes highlight the parent tab.
 */
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { FinanceProAlign } from "./FinanceProAlign";
import { usePathname, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const TABS = [
  { key: "command", label: "Command", href: ROUTES.FINANCE_PRO },
  { key: "collections", label: "Collections", href: ROUTES.FINANCE_PRO_RECEIVABLES },
  { key: "pipeline", label: "Pipeline", href: ROUTES.FINANCE_PRO_TRIPS_POD },
  { key: "intelligence", label: "Intelligence", href: ROUTES.FINANCE_PRO_ANALYTICS },
  { key: "invoice", label: "Invoice", href: ROUTES.FINANCE_PRO_INVOICES },
  { key: "cash", label: "Cash", href: ROUTES.FINANCE_PRO_PAYMENTS },
] as const;

function activeTab(pathname: string): (typeof TABS)[number]["key"] {
  if (pathname.startsWith("/finance-pro/client/")) return "collections";
  if (pathname.startsWith("/finance-pro/trip/")) return "pipeline";
  if (pathname.startsWith("/finance-pro/invoice/")) return "invoice";
  if (pathname.startsWith("/finance-pro/cash/")) return "cash";
  if (pathname === ROUTES.FINANCE_PRO_RECEIVABLES) return "collections";
  if (pathname === ROUTES.FINANCE_PRO_TRIPS_POD) return "pipeline";
  if (pathname === ROUTES.FINANCE_PRO_INVOICES) return "invoice";
  if (pathname === ROUTES.FINANCE_PRO_PAYMENTS) return "cash";
  if (pathname === ROUTES.FINANCE_PRO_ANALYTICS) return "intelligence";
  return "command";
}

export function FinanceProSubTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeTab(pathname);

  return (
    <View style={styles.wrap}>
      <FinanceProAlign>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          accessibilityRole="tablist"
        >
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={styles.tab}
              onPress={() => {
                if (isActive) return;
                router.replace(tab.href as never);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {tab.label}
              </Text>
              {isActive ? <View style={styles.underline} /> : null}
            </Pressable>
          );
        })}
        </ScrollView>
      </FinanceProAlign>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: METRONIC.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 44,
  },
  tab: {
    position: "relative",
    paddingRight: 20,
    paddingLeft: 0,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 8,
    minHeight: 44,
    justifyContent: "flex-end",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: METRONIC.muted,
  },
  labelActive: {
    color: METRONIC.text,
    fontWeight: "800",
  },
  underline: {
    position: "absolute",
    left: 0,
    right: 20,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: METRONIC.link,
  },
});
