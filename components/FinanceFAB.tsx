/**
 * Clean, professional Treasury/Finance FAB.
 * Positioning: this component is presentational only. The parent screen
 * should wrap it in an absolutely positioned container.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { FAB_ICON_ASSETS, type FABIconName } from "@/lib/fabIconAssets";
import { useGlobalFabAnimation } from "@/lib/hooks/useGlobalFabAnimation";
import LottieView from "lottie-react-native";
import {
  Building2,
  CirclePlus,
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
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
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

/** Transparent 3D PNG avatars — preferred over Lottie/SVG when present. */
const FAB_PNG_GLYPH_SOURCE: Partial<Record<FABIconName, ImageSourcePropType>> = {
  building: require("@/assets/file type icons/add-2.png"),
  warehouse: require("@/assets/icon and logos/client.png"),
  user: require("@/assets/icon and logos/taxi-driver.png"),
  "user-plus": require("@/assets/icon and logos/taxi-driver.png"),
  truck: require("@/assets/icon and logos/truck.png"),
  "receipt-text": require("@/assets/file type icons/dollar-calendar.png"),
};

/** Per-party visual scale inside the clipped avatar well. */
const FAB_PNG_GLYPH_SCALE: Partial<Record<FABIconName, number>> = {
  building: 0.92,
  warehouse: 0.98,
  user: 1.04,
  "user-plus": 1.04,
  truck: 0.96,
  "receipt-text": 1.02,
};

/** Fine-tune portrait / wide assets inside the well. */
const FAB_PNG_GLYPH_OFFSET: Partial<
  Record<FABIconName, { translateX?: number; translateY?: number }>
> = {
  building: { translateY: 2 },
  warehouse: { translateY: 3 },
  user: { translateY: 4 },
  "user-plus": { translateY: 4 },
  truck: { translateY: 2 },
  "receipt-text": { translateY: 3 },
};

/** PNG glyphs that already include a plus — skip the satellite badge. */
const FAB_PNG_SUPPRESS_PLUS_SUFFIX: Partial<Record<FABIconName, boolean>> = {
  building: true,
};

const FAB_ANIMATED_GLYPH_SOURCE: Partial<Record<FABIconName, unknown>> = {
  road: require("@/assets/Animated folder/online-tracking.json"),
  package: require("@/assets/Animated folder/loading-cargo.json"),
  "credit-card": require("@/assets/Animated folder/online-payments.json"),
};

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
  const pngGlyphSource = FAB_PNG_GLYPH_SOURCE[icon];
  const shouldShowPlus =
    showPlusSuffix &&
    icon !== "plus" &&
    !(pngGlyphSource && FAB_PNG_SUPPRESS_PLUS_SUFFIX[icon]);

  const MainIcon = icon === "receipt-text" || icon === "credit-card" ? Receipt : IconComponent;
  const animatedGlyphSource = FAB_ANIMATED_GLYPH_SOURCE[icon];
  const usePngGlyphChrome = Boolean(pngGlyphSource);
  const useAnimatedGlyphChrome = !usePngGlyphChrome && Boolean(animatedGlyphSource);
  const useGlyphChrome = usePngGlyphChrome || useAnimatedGlyphChrome;

  const chipSize = Math.round(size * 0.56);
  const assetGlyphSize = Math.round(
    chipSize * (assetGlyph?.glyphScale ?? 0.74),
  );
  const pngPlateSize = Math.round(size * 0.9);
  const pngWellSize = Math.round(pngPlateSize * 0.78);
  const pngGlyphScale = FAB_PNG_GLYPH_SCALE[icon] ?? 1;
  const pngGlyphSize = Math.round(pngWellSize * pngGlyphScale);
  const pngGlyphOffset = FAB_PNG_GLYPH_OFFSET[icon] ?? {};

  const mainGlyph = pngGlyphSource ? (
    <View
      style={[
        styles.pngAvatarPlate,
        {
          width: pngPlateSize,
          height: pngPlateSize,
          borderRadius: pngPlateSize / 2,
        },
      ]}
    >
      <View
        style={[
          styles.pngAvatarWell,
          {
            width: pngWellSize,
            height: pngWellSize,
            borderRadius: pngWellSize / 2,
          },
        ]}
      >
        <Image
          source={pngGlyphSource}
          style={{
            width: pngGlyphSize,
            height: pngGlyphSize,
            transform: [
              { translateX: pngGlyphOffset.translateX ?? 0 },
              { translateY: pngGlyphOffset.translateY ?? 0 },
            ],
          }}
          resizeMode="contain"
        />
      </View>
    </View>
  ) : animatedGlyphSource ? (
    <View
      style={[
        styles.assetChip,
        {
          width: chipSize,
          height: chipSize,
          borderRadius: chipSize / 2,
        },
      ]}
    >
      <LottieView
        source={animatedGlyphSource}
        autoPlay
        loop
        style={{ width: chipSize + 14, height: chipSize + 14 }}
      />
    </View>
  ) : assetGlyph ? (
    <View
      style={[
        styles.assetChip,
        {
          width: chipSize,
          height: chipSize,
          borderRadius: chipSize / 2,
        },
      ]}
    >
      <assetGlyph.Asset width={assetGlyphSize} height={assetGlyphSize} />
    </View>
  ) : (
    <MainIcon size={Math.max(18, iconSize)} color={fabIconColor} strokeWidth={2.4} />
  );

  if (usePngGlyphChrome) {
    return (
      <Reanimated.View
        style={[
          styles.container,
          styles.containerPng,
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
              styles.pngFabShell,
              { width: size, height: size, transform: [{ scale: pressScale }] },
            ]}
          >
            {mainGlyph}
            {shouldShowPlus ? (
              <View style={styles.pngAddBadge}>
                <View style={styles.pngAddBadgeInner}>
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
              backgroundColor: useAnimatedGlyphChrome
                ? Theme.cardWhite
                : fabBgColor,
              borderColor: useGlyphChrome ? "transparent" : Theme.cardWhite,
              borderWidth: useGlyphChrome ? 0 : 2.5,
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
          {shouldShowPlus ? (
            <View style={styles.addBadge}>
              <CirclePlus size={13} color={Theme.brandBlueInk} strokeWidth={2.6} />
            </View>
          ) : null}
        </RNAnimated.View>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // Presentational only: no position/absolute/bottom/right — Screen wraps this and sets position.
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  containerPng: {
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
  pngAvatarPlate: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DDE3EA",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 7,
  },
  pngAvatarWell: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  pngFabShell: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  pngAddBadge: {
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
  pngAddBadgeInner: {
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
  addBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: Theme.accentGold,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
});
