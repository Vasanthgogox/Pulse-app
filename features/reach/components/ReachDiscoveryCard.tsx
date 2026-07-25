/**
 * Pulse Reach discovery entry — placed next to (not replacing) the existing
 * Give/Get Loads quick actions in the Network hub, so Reach is discoverable
 * without opening a Story first. Deliberately its own small component rather
 * than a third NetworkLoadsQuickCards action — that component's cards are
 * all hardwired to open Load Center; branching its shared onPress per-card
 * would be a riskier change than adding one new, isolated card next to it.
 */
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ArrowUpRight, Rocket } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

const cardShadow = Platform.select({
  ios: { shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 },
  android: { elevation: 2 },
  web: { boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)" } as ViewStyle,
  default: {},
});

export interface ReachDiscoveryCardProps {
  /** Matches NetworkLoadsQuickCards' layout prop so both sit flush in the same row. */
  layout?: "default" | "sidebar";
}

export function ReachDiscoveryCard({ layout = "default" }: ReachDiscoveryCardProps) {
  const router = useRouter();
  const sidebar = layout === "sidebar";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        sidebar && styles.cardSidebar,
        pressed && styles.cardPressed,
      ]}
      onPress={() => router.push(ROUTES.REACH.HOME as never)}
      accessibilityRole="button"
      accessibilityLabel="Open Pulse Reach"
    >
      <View style={styles.iconWrap}>
        <Rocket size={18} color={Theme.accentGold} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.chip}>GROWTH</Text>
        <Text style={styles.title}>Pulse Reach</Text>
        <Text style={styles.sub}>Boost loads, earn credits</Text>
      </View>
      <View style={styles.arrowOrb}>
        <ArrowUpRight size={13} color={Theme.accentGold} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.accentGoldMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 10,
    ...cardShadow,
  },
  cardSidebar: {
    marginHorizontal: 0,
    marginTop: 12,
    width: "100%",
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  textCol: { flex: 1, minWidth: 0, gap: 1 },
  chip: { fontSize: 8, fontWeight: "700", letterSpacing: 0.8, color: Theme.accentGold, textTransform: "uppercase" },
  title: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  sub: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary },
  arrowOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
  },
});
