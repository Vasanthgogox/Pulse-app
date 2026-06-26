/**
 * Shared empty-state promo layout for hub screens (trips, load center).
 * Feature chips orbit the hero illustration — top, left, and right.
 */
import Theme from "@/constants/Theme";
import { HubPromoHeroLottie } from "@/components/hub/HubPromoLottie";
import type { AnimationObject } from "lottie-react-native";
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
  Illustration?: ComponentType<SvgProps>;
  /** When set, replaces the SVG hero with a Lottie animation. */
  HeroLottie?: AnimationObject;
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
  illustrationScale?: number;
  /** Trips hub: single large hero only. Load center: orbit chips around hero. */
  layoutMode?: "orbit" | "hero";
  /** Inner Lottie scale inside the fixed hero slot (visual normalization). */
  heroRenderScale?: number;
  /** Fixed hero square size when layoutMode is hero (overrides responsive box). */
  heroSlotSize?: number;
  style?: StyleProp<ViewStyle>;
};

function OrbitChip({
  feature,
  variant,
}: {
  feature: HubEmptyPromoFeature;
  variant: "top" | "side" | "bottom" | "corner";
}) {
  return (
    <View
      style={[
        styles.featureChip,
        variant === "top" && styles.featureChipTop,
        variant === "side" && styles.featureChipSide,
        variant === "bottom" && styles.featureChipBottom,
        variant === "corner" && styles.featureChipCorner,
      ]}
    >
      {feature.icon}
      <Text
        style={[
          styles.featureLabel,
          (variant === "side" || variant === "corner") && styles.featureLabelCorner,
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
  HeroLottie,
  illustrationAspect,
  fitIllustration,
  ctaLabel,
  onCtaPress,
  kicker,
  kickerColor = Theme.primary,
  ctaColor = Theme.primary,
  illustrationScale = 1,
  layoutMode = "orbit",
  heroRenderScale = 1,
  heroSlotSize,
  style,
}: HubEmptyPromoLayoutProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const compact = width < 480;
  const showCta = Boolean(onCtaPress && ctaLabel);
  const heroOnly = layoutMode === "hero";

  const clusterW = compact
    ? Math.min(300, width - 36)
    : isDesktop
      ? Math.min(400, width - 72)
      : Math.min(340, width - 48);

  const heroBoxW = heroOnly
    ? heroSlotSize ??
      (compact
        ? 200
        : isDesktop
          ? 256
          : 228)
    : Math.round(clusterW * 0.55);
  const heroBoxH = heroOnly
    ? heroSlotSize ??
      (compact
        ? 200
        : isDesktop
          ? 256
          : 228)
    : compact
      ? 96
      : isDesktop
        ? 120
        : 108;
  const safeScale = heroOnly ? 1 : Math.min(1, Math.max(0.55, illustrationScale));
  const illusSize = heroOnly
    ? { width: heroBoxW, height: heroBoxH }
    : fitIllustration(
        heroBoxW * safeScale,
        heroBoxH * safeScale,
        illustrationAspect,
      );

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
            heroOnly ? styles.heroStage : styles.orbitCluster,
            heroOnly && { minHeight: illusSize.height },
            !heroOnly && { width: clusterW },
            !heroOnly && compact && styles.orbitClusterCompact,
          ]}
        >
          {!heroOnly && topLeft && topRight ? (
            <View style={styles.orbitRow}>
              <OrbitChip feature={topLeft} variant="corner" />
              <OrbitChip feature={topRight} variant="corner" />
            </View>
          ) : null}

          <View style={[styles.hero, heroOnly && styles.heroLarge]}>
            {HeroLottie ? (
              <HubPromoHeroLottie
                source={HeroLottie}
                width={illusSize.width}
                height={illusSize.height}
                renderScale={heroRenderScale}
              />
            ) : Illustration ? (
              <Illustration width={illusSize.width} height={illusSize.height} />
            ) : null}
          </View>

          {!heroOnly && flankLeft && flankRight ? (
            <View style={styles.orbitRow}>
              <OrbitChip feature={flankLeft} variant="corner" />
              <OrbitChip feature={flankRight} variant="corner" />
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
    maxWidth: 520,
    alignSelf: "center",
  },
  shellDesktop: {
    maxWidth: 560,
  },
  body: {
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  bodyDesktop: {
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  copyHeader: {
    width: "100%",
    alignItems: "center",
    gap: 6,
    maxWidth: 440,
    paddingHorizontal: 4,
  },
  copyHeaderDesktop: {
    maxWidth: 480,
    gap: 8,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 400,
  },
  titleDesktop: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.5,
    maxWidth: 440,
  },
  description: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 16,
    textAlign: "center",
    maxWidth: 380,
  },
  descriptionDesktop: {
    fontSize: 12,
    lineHeight: 17,
    maxWidth: 420,
  },
  orbitCluster: {
    alignSelf: "center",
    alignItems: "center",
    gap: 10,
    overflow: "visible",
  },
  heroStage: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  orbitClusterCompact: {
    gap: 6,
  },
  orbitRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroLarge: {
    width: "100%",
    paddingVertical: 4,
  },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 148,
  },
  featureChipTop: {
    flex: 1,
    maxWidth: 160,
  },
  featureChipSide: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    maxWidth: 108,
  },
  featureChipBottom: {
    flex: 1,
    maxWidth: 160,
  },
  featureChipCorner: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    maxWidth: 132,
    minWidth: 0,
  },
  featureLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 12,
    letterSpacing: 0.02,
  },
  featureLabelCorner: {
    flex: 0,
    textAlign: "center",
    maxWidth: 108,
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
