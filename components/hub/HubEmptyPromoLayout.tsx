/**
 * Shared empty-state promo layout for hub screens (trips, load center).
 * Feature chips orbit the hero illustration — top, left, and right.
 */
import Theme from "@/constants/Theme";
import type { ComponentType, ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { SvgProps } from "react-native-svg";

const DESKTOP_BREAKPOINT = 768;

export type HubEmptyPromoFeature = {
  key: string;
  label: string;
  icon: ReactNode;
};

export type HubEmptyPromoLayoutProps = {
  title: string;
  description: string;
  features: HubEmptyPromoFeature[];
  Illustration: ComponentType<SvgProps>;
  illustrationAspect: number;
  fitIllustration: (
    boxW: number,
    boxH: number,
    aspect: number,
  ) => { width: number; height: number };
  ctaLabel?: string;
  onCtaPress?: () => void;
  kicker?: string;
  kickerColor?: string;
  ctaColor?: string;
  style?: StyleProp<ViewStyle>;
};

function OrbitChip({
  feature,
  variant,
}: {
  feature: HubEmptyPromoFeature;
  variant: "top" | "side" | "bottom";
}) {
  return (
    <View
      style={[
        styles.featureChip,
        variant === "top" && styles.featureChipTop,
        variant === "side" && styles.featureChipSide,
        variant === "bottom" && styles.featureChipBottom,
      ]}
    >
      {feature.icon}
      <Text
        style={[
          styles.featureLabel,
          variant === "side" && styles.featureLabelSide,
        ]}
        numberOfLines={2}
      >
        {feature.label}
      </Text>
    </View>
  );
}

export function HubEmptyPromoLayout({
  title,
  description,
  features,
  Illustration,
  illustrationAspect,
  fitIllustration,
  ctaLabel,
  onCtaPress,
  kicker,
  kickerColor = Theme.primary,
  ctaColor = Theme.primary,
  style,
}: HubEmptyPromoLayoutProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const compact = width < 480;
  const showCta = Boolean(onCtaPress && ctaLabel);

  const illusBoxW = isDesktop
    ? Math.min(340, Math.round(width * 0.28))
    : compact
      ? Math.min(200, width - 120)
      : Math.min(260, width - 100);
  const illusBoxH = isDesktop
    ? Math.min(320, Math.round(width * 0.26))
    : compact
      ? 150
      : 180;
  const illusSize = fitIllustration(illusBoxW, illusBoxH, illustrationAspect);

  const [topLeft, topRight, flankLeft, flankRight] = features;

  return (
    <View style={[styles.shell, isDesktop && styles.shellDesktop, style]}>
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        <View style={[styles.copyHeader, isDesktop && styles.copyHeaderDesktop]}>
          {kicker ? (
            <Text style={[styles.kicker, { color: kickerColor }]}>{kicker}</Text>
          ) : null}
          <Text
            style={[styles.title, isDesktop && styles.titleDesktop]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          <Text
            style={[styles.description, isDesktop && styles.descriptionDesktop]}
          >
            {description}
          </Text>
        </View>

        <View
          style={[
            styles.orbitStage,
            isDesktop && styles.orbitStageDesktop,
            compact && styles.orbitStageCompact,
          ]}
        >
          {topLeft && topRight ? (
            <View style={[styles.orbitTop, isDesktop && styles.orbitTopDesktop]}>
              <OrbitChip feature={topLeft} variant="top" />
              <OrbitChip feature={topRight} variant="top" />
            </View>
          ) : null}

          <View
            style={[
              styles.orbitMiddle,
              isDesktop && styles.orbitMiddleDesktop,
              compact && styles.orbitMiddleCompact,
            ]}
          >
            {isDesktop && flankLeft ? (
              <View style={styles.orbitFlankLeft}>
                <OrbitChip feature={flankLeft} variant="side" />
              </View>
            ) : null}

            <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
              <Illustration width={illusSize.width} height={illusSize.height} />
            </View>

            {isDesktop && flankRight ? (
              <View style={styles.orbitFlankRight}>
                <OrbitChip feature={flankRight} variant="side" />
              </View>
            ) : null}
          </View>

          {!isDesktop && flankLeft && flankRight ? (
            <View style={[styles.orbitBottom, compact && styles.orbitBottomCompact]}>
              <OrbitChip feature={flankLeft} variant="bottom" />
              <OrbitChip feature={flankRight} variant="bottom" />
            </View>
          ) : null}
        </View>

        {showCta ? (
          <Pressable
            onPress={onCtaPress}
            style={({ pressed }) => [
              styles.ctaInline,
              pressed && styles.ctaPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Text style={[styles.ctaText, { color: ctaColor }]}>{ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
  },
  shellDesktop: {
    maxWidth: 760,
    alignSelf: "center",
  },
  body: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  bodyDesktop: {
    gap: 20,
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  copyHeader: {
    width: "100%",
    alignItems: "center",
    gap: 8,
    maxWidth: 520,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  copyHeaderDesktop: {
    maxWidth: 560,
    gap: 10,
    marginBottom: 6,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.45,
    lineHeight: 26,
    textAlign: "center",
    maxWidth: 480,
  },
  titleDesktop: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
    letterSpacing: -0.55,
    maxWidth: 520,
  },
  description: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 17,
    textAlign: "center",
    maxWidth: 420,
  },
  descriptionDesktop: {
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 460,
  },
  orbitStage: {
    width: "100%",
    alignItems: "center",
    gap: 10,
    maxWidth: 520,
  },
  orbitStageDesktop: {
    maxWidth: 680,
    gap: 12,
  },
  orbitStageCompact: {
    maxWidth: 360,
    gap: 8,
  },
  orbitTop: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 4,
    gap: 8,
  },
  orbitTopDesktop: {
    paddingHorizontal: 24,
    maxWidth: 560,
    alignSelf: "center",
  },
  orbitMiddle: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  orbitMiddleDesktop: {
    justifyContent: "center",
    gap: 8,
    minHeight: 280,
  },
  orbitMiddleCompact: {
    minHeight: 160,
  },
  orbitFlankLeft: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 6,
    minWidth: 0,
  },
  orbitFlankRight: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 6,
    minWidth: 0,
  },
  orbitBottom: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    gap: 8,
  },
  orbitBottomCompact: {
    paddingHorizontal: 0,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroDesktop: {
    paddingHorizontal: 4,
  },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 148,
  },
  featureChipTop: {
    flex: 1,
    maxWidth: 160,
  },
  featureChipSide: {
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    maxWidth: 108,
  },
  featureChipBottom: {
    flex: 1,
    maxWidth: 160,
  },
  featureLabel: {
    flex: 1,
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 11,
    letterSpacing: 0.02,
  },
  featureLabelSide: {
    flex: 0,
    textAlign: "center",
    maxWidth: 96,
  },
  ctaInline: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  ctaPressed: {
    opacity: 0.7,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
    textAlign: "center",
  },
});
