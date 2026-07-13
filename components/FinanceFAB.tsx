/**
 * Clean, professional Treasury/Finance FAB.
 * Positioning: this component is presentational only. The parent screen
 * should wrap it in an absolutely positioned container.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { FAB_ICON_ASSETS, type FABIconName } from "@/lib/fabIconAssets";
import { resolveFabLottie } from "@/lib/fabLottieAssets";
import { useGlobalFabAnimation } from "@/lib/hooks/useGlobalFabAnimation";
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

/** Lottie well diameter as a fraction of the FAB diameter. */
const FAB_LOTTIE_WELL_RATIO = 0.78;

export function FinanceFAB({
  onPress,
  accessibilityLabel,
  icon = "plus",
  iconSize = 20,
  showPlusSuffix = true,
  testID,
  style,
  size = Layout.fabSize,
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
  const shouldShowPlus = showPlusSuffix && icon !== "plus";

  const MainIcon = icon === "receipt-text" || icon === "credit-card" ? Receipt : IconComponent;
  const useIllustrationGlyph = Boolean(assetGlyph);
  const useLottieGlyph = !useIllustrationGlyph && Boolean(lottieGlyph);
  const useGlyphChrome = useIllustrationGlyph || useLottieGlyph;

  const glyphWellSize = Math.round(size * FAB_LOTTIE_WELL_RATIO);
  const assetGlyphSize = Math.round(
    glyphWellSize * (assetGlyph?.glyphScale ?? 0.88),
  );
  const lottieRenderSize = lottieGlyph
    ? Math.round(glyphWellSize * lottieGlyph.renderScale)
    : 0;

  const mainGlyph = useIllustrationGlyph && assetGlyph ? (
    <View
      style={[
        styles.assetChip,
        {
          width: glyphWellSize,
          height: glyphWellSize,
          borderRadius: glyphWellSize / 2,
        },
      ]}
    >
      <assetGlyph.Asset width={assetGlyphSize} height={assetGlyphSize} />
    </View>
  ) : useLottieGlyph && lottieGlyph ? (
    <View
      style={[
        styles.lottieWell,
        {
          width: glyphWellSize,
          height: glyphWellSize,
          borderRadius: glyphWellSize / 2,
        },
      ]}
    >
      <LottieView
        source={lottieGlyph.source}
        autoPlay
        loop
        speed={0.9}
        resizeMode="contain"
        style={{
          width: lottieRenderSize,
          height: lottieRenderSize,
          position: "absolute",
        }}
      />
    </View>
  ) : (
    <MainIcon size={Math.max(18, iconSize)} color={fabIconColor} strokeWidth={2.4} />
  );

  if (useGlyphChrome) {
    return (
      <Reanimated.View
        style={[
          styles.container,
          styles.containerGlyph,
          { width: size, height: size },
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
          activeOpacity={0.92}
          accessibilityLabel={accessibilityLabel}
        >
          <RNAnimated.View
            style={[
              styles.glyphFabShell,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                transform: [{ scale: pressScale }],
              },
            ]}
          >
            {mainGlyph}
            {shouldShowPlus ? (
              <View style={styles.glyphAddBadge}>
                <View style={styles.glyphAddBadgeInner}>
                  <Plus size={11} color={Theme.brandBlueInk} strokeWidth={3} />
                </View>
              </View>
            ) : null}
          </RNAnimated.View>
        </TouchableOpacity>
      </Reanimated.View>
    );
  }

  return (
    <Reanimated.View
      style={[
        styles.container,
        { width: size, height: size },
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
        activeOpacity={0.9}
        accessibilityLabel={accessibilityLabel}
      >
        <RNAnimated.View
          style={[
            styles.fab,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: fabBgColor,
              borderColor: Theme.cardWhite,
              borderWidth: 2.5,
              transform: [{ scale: pressScale }],
            },
          ]}
        >
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
          {mainGlyph}
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
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DDE3EA",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 7,
  },
  lottieWell: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  glyphAddBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 4,
  },
  glyphAddBadgeInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.accentGold,
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  assetChip: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
});
