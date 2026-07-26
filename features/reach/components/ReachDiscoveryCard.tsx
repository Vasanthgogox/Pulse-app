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
  ios: {
    shadowColor: Theme.accentBrownDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  android: { elevation: 3 },
  web: {
    boxShadow: "0 8px 22px rgba(77, 54, 54, 0.1)",
  } as ViewStyle,
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
      <View style={styles.glowBlob} pointerEvents="none" />
      <View style={styles.iconWrap}>
        <Rocket size={17} color={Theme.textOnPrimary} strokeWidth={2.25} />
      </View>
      <View style={styles.textCol}>
        <View style={styles.chipRow}>
          <Text style={styles.chip}>GROWTH</Text>
          <View style={styles.chipDot} />
          <Text style={styles.chipMeta}>BOOST</Text>
        </View>
        <Text style={styles.title}>Pulse Reach</Text>
        <Text style={styles.sub}>Boost loads, earn credits</Text>
      </View>
      <View style={styles.arrowOrb}>
        <ArrowUpRight size={13} color={Theme.accentBrown} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.accentBrownWash,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginHorizontal: 16,
    marginTop: 10,
    overflow: "hidden",
    position: "relative",
    ...cardShadow,
  },
  cardSidebar: {
    marginHorizontal: 0,
    marginTop: 12,
    width: "100%",
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  glowBlob: {
    position: "absolute",
    right: -18,
    top: -22,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Theme.accentBrownSoft,
    opacity: 0.7,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.accentBrownDeep,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chip: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: Theme.accentBrown,
    textTransform: "uppercase",
  },
  chipDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Theme.accentBrownBorder,
  },
  chipMeta: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: Theme.textRouteCard,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: Theme.accentBrownDeep,
  },
  sub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textRouteCard,
  },
  arrowOrb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.accentBrownBorder,
  },
});
