/**
 * Give / Get loads — Network home quick actions with Metronic illustrations.
 */
import Theme from "@/constants/Theme";
import { NETWORK_HUB_GRID_ROW_PADDING_H } from "@/features/network/constants/networkHubGrid";
import {
  fitNetworkLoadsIllustration,
  NETWORK_LOADS_QUICK_ACTIONS,
  type NetworkLoadsQuickAction,
} from "@/lib/networkLoadsQuickCardsAssets";
import { ROUTES } from "@/lib/routes";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ArrowUpRight, Zap } from "lucide-react-native";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

export interface NetworkLoadsQuickCardsProps {
  compact?: boolean;
  layout?: "default" | "sidebar";
}

type MarketplaceCardProps = {
  action: NetworkLoadsQuickAction;
  pressed: boolean;
  compact?: boolean;
  variant: "tile" | "sidebar";
};

function MarketplaceCard({
  action,
  pressed,
  compact,
  variant,
}: MarketplaceCardProps) {
  const { width } = useWindowDimensions();
  const sidebar = variant === "sidebar";
  const Illustration = action.illustration;

  const illusBoxW = sidebar ? 76 : compact || width < 380 ? 80 : 96;
  const illusBoxH = sidebar ? 64 : compact || width < 380 ? 68 : 80;
  const illusSize = fitNetworkLoadsIllustration(
    illusBoxW,
    illusBoxH,
    action.aspect,
  );

  return (
    <View
      style={[
        styles.card,
        sidebar && styles.cardSidebar,
        compact && !sidebar && styles.cardCompact,
        { backgroundColor: action.wash },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.cardBody, sidebar && styles.cardBodySidebar]}>
        <View style={[styles.textCol, sidebar && styles.textColSidebar]}>
          <Text style={[styles.chip, { color: action.accent }]}>
            {action.chip}
          </Text>
          <Text
            style={[styles.title, sidebar && styles.titleSidebar]}
            numberOfLines={2}
          >
            {action.label}
          </Text>
          <Text
            style={[styles.sub, sidebar && styles.subSidebar]}
            numberOfLines={2}
          >
            {action.sub}
          </Text>
        </View>

        <View
          style={[
            styles.illusWrap,
            sidebar && styles.illusWrapSidebar,
          ]}
        >
          <Illustration
            width={illusSize.width}
            height={illusSize.height}
          />
        </View>

        <View
          style={[
            styles.arrowOrb,
            { borderColor: `${action.accent}28`, backgroundColor: Theme.cardWhite },
          ]}
        >
          <ArrowUpRight
            size={sidebar ? 12 : 13}
            color={action.accent}
            strokeWidth={2.2}
          />
        </View>
      </View>
    </View>
  );
}

function SectionHeader({ sidebar }: { sidebar?: boolean }) {
  return (
    <View style={sidebar ? styles.headSidebar : styles.head}>
      <View style={styles.headPill}>
        <View style={styles.headIconOrb}>
          <Zap size={sidebar ? 10 : 11} color={Theme.primary} strokeWidth={2} />
        </View>
        <Text
          style={sidebar ? styles.headTitleSidebar : styles.headTitle}
          numberOfLines={1}
        >
          Load marketplace
        </Text>
      </View>
      {!sidebar ? (
        <Text style={styles.headHint}>Tap to open Load Center</Text>
      ) : null}
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

  const renderCard = (
    action: NetworkLoadsQuickAction,
    variant: "tile" | "sidebar",
  ) => {
    const tile = variant === "tile";
    return (
      <View
        key={action.id}
        style={tile ? styles.cardSlot : styles.sidebarCardPress}
      >
        <Pressable
          onPress={openLoadCenter}
          style={({ pressed }) => [
            tile ? styles.cardPress : styles.sidebarCardPressInner,
            pressed && styles.pressableScale,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${action.label} — open Load Center`}
        >
          {({ pressed }) => (
            <MarketplaceCard
              action={action}
              pressed={pressed}
              compact={compact}
              variant={variant}
            />
          )}
        </Pressable>
      </View>
    );
  };

  if (sidebar) {
    return (
      <View style={styles.wrapSidebar}>
        <View style={styles.railSidebar}>
          {NETWORK_LOADS_QUICK_ACTIONS.map((action) =>
            renderCard(action, "sidebar"),
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <SectionHeader />
      <View style={[styles.rail, compact && styles.railCompact]}>
        {NETWORK_LOADS_QUICK_ACTIONS.map((action) =>
          renderCard(action, "tile"),
        )}
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  android: { elevation: 2 },
  web: {
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
  } as ViewStyle,
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 10,
    marginTop: 8,
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingBottom: 12,
  },
  wrapCompact: {
    marginTop: 6,
    paddingBottom: 10,
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
    width: "100%",
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
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    maxWidth: "100%",
    flexShrink: 1,
  },
  headIconOrb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
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
    alignSelf: "stretch",
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
  card: {
    flex: 1,
    width: "100%",
    minHeight: 108,
    borderRadius: 14,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...cardShadow,
  },
  cardCompact: {
    minHeight: 100,
    borderRadius: 12,
  },
  cardSidebar: {
    minHeight: 92,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  cardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 108,
  },
  cardBodySidebar: {
    paddingHorizontal: 13,
    paddingVertical: 12,
    minHeight: 92,
    gap: 8,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    justifyContent: "center",
  },
  textColSidebar: {
    gap: 3,
  },
  chip: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.35,
    lineHeight: 18,
  },
  titleSidebar: {
    fontSize: 14,
    lineHeight: 17,
  },
  sub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  subSidebar: {
    fontSize: 10,
    lineHeight: 14,
  },
  illusWrap: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    minWidth: 0,
  },
  illusWrapSidebar: {
    marginRight: 0,
  },
  arrowOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
    alignSelf: "center",
  },
  cardSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  cardPress: {
    flex: 1,
    alignSelf: "stretch",
    minWidth: 0,
  },
  sidebarCardPress: {
    width: "100%",
    minWidth: 0,
  },
  sidebarCardPressInner: {
    width: "100%",
    minWidth: 0,
  },
  pressableScale: {
    opacity: 0.98,
  },
});
