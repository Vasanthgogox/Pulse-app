/**
 * Load Center empty-state — title, copy, and one large hero Lottie per tab/status.
 */
import { HubEmptyPromoLayout } from "@/components/hub/HubEmptyPromoLayout";
import {
  LOAD_CENTER_PROMO_PRESETS,
  type LoadCenterPromoVariant,
} from "@/lib/loadCenterPromoAssets";
import {
  LOAD_CENTER_PROMO_HERO_SLOT,
  resolveLoadCenterPromoHeroLottie,
  resolveLoadCenterPromoHeroVisualScale,
} from "@/lib/loadCenterPromoLottieAssets";
import { useWindowDimensions } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

const DESKTOP_BREAKPOINT = 768;

export type LoadCenterPromoCardProps = {
  variant: LoadCenterPromoVariant;
  onCtaPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function LoadCenterPromoCard({
  variant,
  onCtaPress,
  style,
}: LoadCenterPromoCardProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const compact = width < 480;
  const preset = LOAD_CENTER_PROMO_PRESETS[variant];
  const heroSlotSize = compact
    ? LOAD_CENTER_PROMO_HERO_SLOT.compact
    : isDesktop
      ? LOAD_CENTER_PROMO_HERO_SLOT.desktop
      : LOAD_CENTER_PROMO_HERO_SLOT.mobile;

  return (
    <HubEmptyPromoLayout
      style={style}
      layoutMode="hero"
      title={preset.title}
      description={preset.description}
      HeroLottie={resolveLoadCenterPromoHeroLottie(variant)}
      heroRenderScale={resolveLoadCenterPromoHeroVisualScale(variant)}
      heroSlotSize={heroSlotSize}
      illustrationAspect={1}
      fitIllustration={(_boxW, boxH) => ({
        width: boxH,
        height: boxH,
      })}
      ctaLabel={preset.ctaLabel}
      onCtaPress={onCtaPress}
      features={[]}
    />
  );
}
