/**
 * Give / Get loads — Network home quick actions (Apple-style frosted glass).
 */
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ArrowUpRight, Package, Search, Zap } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

const GLASS_WEB: ViewStyle =
  Platform.OS === "web"
    ? ({
        backdropFilter: "blur(24px) saturate(190%)",
        WebkitBackdropFilter: "blur(24px) saturate(190%)",
      } as ViewStyle)
    : {};

const GLASS_FADE = "rgba(255,255,255,0.02)";

const ACTIONS = [
  {
    id: "give",
    label: "Give loads",
    sub: "Post open freight",
    chip: "Supply",
    Icon: Package,
    accent: Theme.networkGlassSupplyAccent,
    gradient: [Theme.networkGlassSupplyGradient, GLASS_FADE] as const,
    iconBg: Theme.networkGlassSupplyIconBg,
  },
  {
    id: "get",
    label: "Get loads",
    sub: "Bid on freight",
    chip: "Demand",
    Icon: Search,
    accent: Theme.networkGlassDemandAccent,
    gradient: [Theme.networkGlassDemandGradient, GLASS_FADE] as const,
    iconBg: Theme.networkGlassDemandIconBg,
  },
] as const;

export interface NetworkLoadsQuickCardsProps {
  compact?: boolean;
  layout?: "default" | "sidebar";
}

type GlassCardProps = {
  label: string;
  sub: string;
  chip: string;
  Icon: (typeof ACTIONS)[number]["Icon"];
  accent: string;
  gradient: readonly [string, string];
  iconBg: string;
  pressed: boolean;
  compact?: boolean;
  variant: "tile" | "sidebar";
};

function GlassMarketplaceCard({
  label,
  sub,
  chip,
  Icon,
  accent,
  gradient,
  iconBg,
  pressed,
  compact,
  variant,
}: GlassCardProps) {
  const sidebar = variant === "sidebar";

  return (
    <View
      style={[
        styles.glassShell,
        sidebar ? styles.shellSidebar : styles.shellTile,
        compact && !sidebar && styles.shellTileCompact,
        GLASS_WEB,
        pressed && styles.shellPressed,
      ]}
    >
      <LinearGradient
        colors={[...gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[Theme.networkGlassSpecular, "rgba(255,255,255,0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={styles.specular}
        pointerEvents="none"
      />
      <View style={styles.edgeHighlight} pointerEvents="none" />

      {sidebar ? (
        <View style={styles.sidebarInner}>
          <View style={[styles.iconOrb, styles.iconOrbSidebar, { backgroundColor: iconBg }]}>
            <Icon size={15} color={accent} strokeWidth={2} />
          </View>
          <View style={styles.sidebarTextCol}>
            <Text style={[styles.chip, { color: accent }]}>{chip}</Text>
            <Text style={styles.sidebarTitle} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.sidebarSub} numberOfLines={1}>
              {sub}
            </Text>
          </View>
          <View style={styles.arrowOrb}>
            <ArrowUpRight size={12} color={accent} strokeWidth={2.2} />
          </View>
        </View>
      ) : (
        <View style={[styles.tileInner, compact && styles.tileInnerCompact]}>
          <View style={styles.tileTop}>
            <View style={styles.tileMeta}>
              <View style={[styles.iconOrb, { backgroundColor: iconBg }]}>
                <Icon size={13} color={accent} strokeWidth={2} />
              </View>
              <Text style={[styles.chip, { color: accent }]}>{chip}</Text>
            </View>
            <View style={styles.arrowOrb}>
              <ArrowUpRight size={13} color={accent} strokeWidth={2.2} />
            </View>
          </View>
          <Text style={[styles.tileTitle, compact && styles.tileTitleCompact]} numberOfLines={2}>
            {label}
          </Text>
          <Text style={[styles.tileSub, compact && styles.tileSubCompact]} numberOfLines={2}>
            {sub}
          </Text>
        </View>
      )}
    </View>
  );
}

function SectionHeader({ sidebar }: { sidebar?: boolean }) {
  return (
    <View style={sidebar ? styles.headSidebar : styles.head}>
      <View style={styles.headPill}>
        <View style={styles.headIconOrb}>
          <Zap size={sidebar ? 10 : 11} color={Theme.networkGlassSupplyAccent} strokeWidth={2} />
        </View>
        <Text style={sidebar ? styles.headTitleSidebar : styles.headTitle} numberOfLines={1}>
          Load marketplace
        </Text>
      </View>
      {!sidebar ? <Text style={styles.headHint}>Tap to open Load Center</Text> : null}
    </View>
  );
}

export function NetworkLoadsQuickCards({
  compact = false,
  layout = "default",
}: NetworkLoadsQuickCardsProps) {
  const router = useRouter();
  const sidebar = layout === "sidebar";

  const openLoadCenter = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(ROUTES.PULSE_LOADS);
  };

  const renderCard = (action: (typeof ACTIONS)[number], variant: "tile" | "sidebar") => (
    <Pressable
      key={action.id}
      onPress={openLoadCenter}
      style={({ pressed }) => [
        variant === "tile" ? styles.cardPress : styles.sidebarCardPress,
        pressed && styles.pressableScale,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${action.label} — open Load Center`}
    >
      {({ pressed }) => (
        <GlassMarketplaceCard
          {...action}
          pressed={pressed}
          compact={compact}
          variant={variant}
        />
      )}
    </Pressable>
  );

  if (sidebar) {
    return (
      <View style={styles.wrapSidebar}>
        <SectionHeader sidebar />
        <View style={styles.railSidebar}>
          {ACTIONS.map((action) => renderCard(action, "sidebar"))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <SectionHeader />
      <View style={[styles.rail, compact && styles.railCompact]}>
        {ACTIONS.map((action) => renderCard(action, "tile"))}
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  android: { elevation: 4 },
  web: {
    boxShadow:
      "0 8px 28px rgba(15, 23, 42, 0.07), 0 1px 0 rgba(255, 255, 255, 0.9) inset",
  },
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 10,
  },
  wrapSidebar: {
    width: "100%",
    minWidth: 0,
    gap: 12,
    justifyContent: "center",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  },
  headSidebar: {
    paddingHorizontal: 0,
  },
  headPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: Theme.networkGlassHeadPill,
    borderWidth: 1,
    borderColor: Theme.networkGlassBorder,
    maxWidth: "100%",
    flexShrink: 1,
  },
  headIconOrb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.networkGlassInset,
    borderWidth: 1,
    borderColor: Theme.networkGlassBorder,
  },
  headTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.35,
  },
  headTitleSidebar: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  headHint: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  rail: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    width: "100%",
  },
  railCompact: {
    gap: 10,
  },
  railSidebar: {
    flexDirection: "column",
    gap: 10,
    width: "100%",
  },
  glassShell: {
    overflow: "hidden",
    position: "relative",
    backgroundColor: Theme.networkGlassSurface,
    borderWidth: 1,
    borderColor: Theme.networkGlassBorderOuter,
    ...cardShadow,
  },
  shellPressed: {
    backgroundColor: Theme.networkGlassSurfacePressed,
    transform: [{ scale: 0.985 }],
  },
  shellTile: {
    minHeight: 80,
    borderRadius: 20,
  },
  shellTileCompact: {
    minHeight: 72,
    borderRadius: 18,
  },
  shellSidebar: {
    width: "100%",
    borderRadius: 18,
  },
  specular: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  edgeHighlight: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.networkGlassBorder,
    zIndex: 1,
  },
  tileInner: {
    flex: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 6,
    justifyContent: "center",
    minHeight: 80,
    zIndex: 2,
  },
  tileInnerCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
    gap: 5,
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tileMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 1,
    minWidth: 0,
  },
  iconOrb: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.networkGlassBorder,
  },
  iconOrbSidebar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    flexShrink: 0,
  },
  chip: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0.75,
    textTransform: "uppercase",
  },
  arrowOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.networkGlassInset,
    borderWidth: 1,
    borderColor: Theme.networkGlassBorder,
    flexShrink: 0,
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.35,
    lineHeight: 17,
  },
  tileTitleCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  tileSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.02,
    lineHeight: 13,
  },
  tileSubCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  sidebarInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    zIndex: 2,
  },
  sidebarTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  sidebarTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.35,
    lineHeight: 17,
  },
  sidebarSub: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 13,
  },
  cardPress: {
    flex: 1,
    minWidth: 0,
  },
  sidebarCardPress: {
    width: "100%",
    minWidth: 0,
  },
  pressableScale: {
    opacity: 0.97,
  },
});
