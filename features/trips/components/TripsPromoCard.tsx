/**
 * Trips hub empty-state — title, copy, and one large hero Lottie per status tab.
 */
import { HubEmptyPromoLayout } from "@/components/hub/HubEmptyPromoLayout";
import {
  TRIPS_PROMO_PRESETS,
  type TripsPromoVariant,
} from "@/lib/tripsPromoAssets";
import {
  TRIPS_PROMO_HERO_SLOT,
  resolveTripsPromoHeroLottie,
  resolveTripsPromoHeroVisualScale,
} from "@/lib/tripsPromoLottieAssets";
import { useWindowDimensions } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

const DESKTOP_BREAKPOINT = 768;

export type TripsPromoCardProps = {
  variant: TripsPromoVariant;
  onCtaPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function TripsPromoCard({ variant, onCtaPress, style }: TripsPromoCardProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const compact = width < 480;
  const preset = TRIPS_PROMO_PRESETS[variant];
  const heroSlotSize = compact
    ? TRIPS_PROMO_HERO_SLOT.compact
    : isDesktop
      ? TRIPS_PROMO_HERO_SLOT.desktop
      : TRIPS_PROMO_HERO_SLOT.mobile;

  return (
    <HubEmptyPromoLayout
      style={style}
      layoutMode="hero"
      title={preset.title}
      description={preset.description}
      HeroLottie={resolveTripsPromoHeroLottie(variant)}
      heroRenderScale={resolveTripsPromoHeroVisualScale(variant)}
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
