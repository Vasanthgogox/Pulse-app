import Theme from "@/constants/Theme";
import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FINANCE_PRO_LAUNCH } from "./financeProLaunch";

export function FinanceProHandoffActions({
  extras,
}: {
  extras?: { label: string; onPress: () => void }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const items = [
    ...(extras ?? []),
    {
      label: "Open Pulse Invoice",
      onPress: () => router.push(FINANCE_PRO_LAUNCH.pulseInvoice(pathname)),
    },
    {
      label: "Open Pulse POD",
      onPress: () => router.push(FINANCE_PRO_LAUNCH.pulsePod(pathname)),
    },
    {
      label: "Open Ledger",
      onPress: () => router.push(FINANCE_PRO_LAUNCH.coreLedger),
    },
  ];
  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <Pressable
          key={item.label}
          style={styles.btn}
          onPress={item.onPress}
          accessibilityRole="button"
        >
          <Text style={styles.text}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.primary,
    borderRadius: 8,
  },
  text: { fontWeight: "800", color: Theme.primary, fontSize: 13 },
});
