/**
 * Clean, professional Treasury/Finance FAB.
 * Positioning: this component is presentational only. The parent screen
 * should wrap it in an absolutely positioned container.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  FAB_ICON_ASSETS,
  PARTY_FAB_ADD_LABELS,
  type FABIconName,
} from "@/lib/fabIconAssets";
import { resolveFabLottie } from "@/lib/fabLottieAssets";
import { useGlobalFabAnimation } from "@/lib/hooks/useGlobalFabAnimation";
import { PartyAddChip, type PartyAddChipIcon } from "@/components/PartyAddChip";
import LottieView from "lottie-react-native";
import {
  Building2,
  Package,
  Plus,
  Receipt,
  ReceiptText,
  Route,
  Truck,
  User,
  Warehouse,
  type LucideIcon,
} from "lucide-react-native";
import { pe } from "@/lib/platformViewStyle.util";
import React from "react";
import {
  Animated as RNAnimated,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Reanimated from "react-native-reanimated";

export type { FABIconName } from "@/lib/fabIconAssets";

export interface FinanceFABProps {
  onPress: () => void;
  accessibilityLabel: string;
  /** Semantic add icon for the current action context. */
  icon?: FABIconName;
  iconSize?: number;
  /** When true (default), shows a small plus suffix so users understand it's an add action. */
  showPlusSuffix?: boolean;
  testID?: string;
  /** Optional style merge (e.g. from parent); do not use for positioning — Screen owns position. */
  style?: StyleProp<ViewStyle>;
  /** Optional larger visible action button size (default 56). */
  size?: number;
  /** Visible add label (defaults from icon for party adds). */
  label?: string;
}

function triggerHapticMedium() {
  try {
    const Haptics = require("expo-haptics");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  } catch {
    // expo-haptics not installed or unavailable
  }
}

function getLucideIcon(name: FABIconName): LucideIcon {
  switch (name) {
    case "receipt-text":
    case "credit-card":
      return ReceiptText;
    case "user":
    case "user-plus":
      return User;
    case "building":
      return Building2;
    case "warehouse":
      return Warehouse;
    case "truck":
      return Truck;
    case "road":
      return Route;
    case "package":
      return Package;
    case "plus":
    default:
      return Plus;
  }
}

/** Glyph diameter as a fraction of the FAB diameter (no inner chip). */
const FAB_GLYPH_RATIO = 0.86;

const PARTY_CHIP_ICONS = new Set<PartyAddChipIcon>([
  "building",
  "warehouse",
  "truck",
  "user",
  "user-plus",
  "receipt-text",
]);

function toPartyChipIcon(icon: FABIconName): PartyAddChipIcon {
  if (PARTY_CHIP_ICONS.has(icon as PartyAddChipIcon)) {
    return icon as PartyAddChipIcon;
  }
  return "building";
}

export function FinanceFAB({
  onPress,
  accessibilityLabel,
  icon = "plus",
  iconSize = 20,
  showPlusSuffix = true,
  testID,
  style,
  size = Layout.fabSize,
  label,
}: FinanceFABProps) {
  const { shellStyle, ringStyle } = useGlobalFabAnimation();
  const pressScale = React.useRef(new RNAnimated.Value(1)).current;

  const handlePress = () => {
    triggerHapticMedium();
    onPress();
  };
  const handlePressIn = () => {
    RNAnimated.spring(pressScale, {
      toValue: 0.94,
      friction: 7,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    RNAnimated.spring(pressScale, {
      toValue: 1,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  const fabBgColor = Theme.darkBackground;
  const fabIconColor = Theme.buttonDarkText;
  const assetGlyph = FAB_ICON_ASSETS[icon];
  const IconComponent = getLucideIcon(icon);
  const lottieGlyph = resolveFabLottie(icon);
  const partyAddLabel = label ?? PARTY_FAB_ADD_LABELS[icon];
  const useTextGlyph = Boolean(partyAddLabel);
  const shouldShowPlus =
    showPlusSuffix && icon !== "plus" && !useTextGlyph;

  const MainIcon = icon === "receipt-text" || icon === "credit-card" ? Receipt : IconComponent;
  const useIllustrationGlyph = !useTextGlyph && Boolean(assetGlyph);
  const useLottieGlyph =
    !useTextGlyph && !useIllustrationGlyph && Boolean(lottieGlyph);
  const useGlyphChrome =
    useTextGlyph || useIllustrationGlyph || useLottieGlyph;

  const glyphSize = Math.round(size * FAB_GLYPH_RATIO);
  const assetGlyphSize = Math.round(
    glyphSize * (assetGlyph?.glyphScale ?? 0.88),
  );
  const lottieRenderSize = lottieGlyph
    ? Math.round(glyphSize * lottieGlyph.renderScale)
    : 0;

  const mainGlyph = useTextGlyph ? null : useIllustrationGlyph && assetGlyph ? (
    <assetGlyph.Asset width={assetGlyphSize} height={assetGlyphSize} />
  ) : useLottieGlyph && lottieGlyph ? (
    <LottieView
      source={lottieGlyph.source}
      autoPlay
      loop
      speed={0.9}
      resizeMode="contain"
      style={{
        width: lottieRenderSize,
        height: lottieRenderSize,
      }}
    />
  ) : (
    <MainIcon size={Math.max(18, iconSize)} color={fabIconColor} strokeWidth={2.4} />
  );

  const shellWidth = useTextGlyph ? undefined : size;
  const shellHeight = useTextGlyph ? undefined : size;

  if (useTextGlyph && partyAddLabel) {
    return (
      <Reanimated.View
        style={[
          styles.containerPartyChip,
          style,
          shellStyle,
          pe("box-none"),
        ]}
      >
        <PartyAddChip
          label={partyAddLabel}
          icon={toPartyChipIcon(icon)}
          onPress={handlePress}
          accessibilityLabel={accessibilityLabel}
          expandOnHover
          collapsedGlyph="icon"
          align="end"
          testID={testID}
        />
      </Reanimated.View>
    );
  }

  return (
    <Reanimated.View
      style={[
        styles.container,
        useGlyphChrome && styles.containerGlyph,
        shellWidth != null && shellHeight != null
          ? { width: shellWidth, height: shellHeight }
          : null,
        style,
        shellStyle,
        pe("box-none"),
      ]}
    >
      <TouchableOpacity
        testID={testID}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={useGlyphChrome ? 0.92 : 0.9}
        accessibilityLabel={accessibilityLabel}
      >
        <RNAnimated.View
          style={[
            useGlyphChrome ? styles.glyphFabShell : styles.fab,
            shellWidth != null && shellHeight != null
              ? {
                  width: shellWidth,
                  height: shellHeight,
                  borderRadius: size / 2,
                }
              : null,
            {
              backgroundColor: useGlyphChrome ? "transparent" : fabBgColor,
              transform: [{ scale: pressScale }],
            },
          ]}
        >
          {!useGlyphChrome ? (
            <Reanimated.View
              style={[
                styles.innerRing,
                {
                  width: size - 10,
                  height: size - 10,
                  borderRadius: (size - 10) / 2,
                },
                ringStyle,
                pe("none"),
              ]}
            />
          ) : null}
          {mainGlyph}
          {useGlyphChrome && shouldShowPlus ? (
            <View style={styles.glyphAddBadge}>
              <Plus size={11} color={Theme.brandBlueInk} strokeWidth={3} />
            </View>
          ) : null}
        </RNAnimated.View>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  containerGlyph: {
    overflow: "visible",
  },
  containerPartyChip: {
    alignItems: "flex-end",
    overflow: "visible",
  },
  fab: {
    width: Layout.fabSize,
    height: Layout.fabSize,
    borderRadius: Layout.fabBorderRadius,
    borderWidth: 2.5,
    borderColor: Theme.cardWhite,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 10,
  },
  glyphFabShell: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  glyphAddBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.accentGold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 4,
  },
  innerRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
});
