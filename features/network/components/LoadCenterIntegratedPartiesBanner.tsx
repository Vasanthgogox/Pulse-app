/**
 * Load Center — empty state when no integrated supplier/client yet.
 * Matches trips hub: centered copy + one large hero Lottie.
 */
import { HubEmptyPromoLayout } from "@/components/hub/HubEmptyPromoLayout";
import {
  LOAD_CENTER_INTEGRATED_PARTIES_PROMO,
  type LoadCenterIntegratedPartyMode,
} from "@/lib/loadCenterIntegratedPartiesPromoAssets";
import { LOAD_CENTER_PROMO_HERO_SLOT } from "@/lib/loadCenterPromoLottieAssets";
import {
  resolveIntegratedPartiesHeroLottie,
  resolveIntegratedPartiesHeroVisualScale,
} from "@/lib/loadCenterIntegratedPartiesLottieAssets";
import { useWindowDimensions } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

const DESKTOP_BREAKPOINT = 768;

export type LoadCenterIntegratedPartiesBannerProps = {
  mode: LoadCenterIntegratedPartyMode;
  onExploreNetwork: () => void;
  style?: StyleProp<ViewStyle>;
};

export function LoadCenterIntegratedPartiesBanner({
  mode,
  onExploreNetwork,
  style,
}: LoadCenterIntegratedPartiesBannerProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const compact = width < 480;
  const preset = LOAD_CENTER_INTEGRATED_PARTIES_PROMO[mode];
  const heroSlotSize = compact
    ? LOAD_CENTER_PROMO_HERO_SLOT.compact
    : isDesktop
      ? LOAD_CENTER_PROMO_HERO_SLOT.desktop
      : LOAD_CENTER_PROMO_HERO_SLOT.mobile;

  return (
    <HubEmptyPromoLayout
      style={style}
      layoutMode="hero"
      kicker={preset.chip}
      kickerColor={preset.chipColor}
      title={preset.title}
      description={preset.description}
      HeroLottie={resolveIntegratedPartiesHeroLottie(mode)}
      heroRenderScale={resolveIntegratedPartiesHeroVisualScale(mode)}
      heroSlotSize={heroSlotSize}
      illustrationAspect={1}
      fitIllustration={(_boxW, boxH) => ({
        width: boxH,
        height: boxH,
      })}
      ctaLabel={preset.ctaLabel}
      onCtaPress={onExploreNetwork}
      ctaColor={preset.chipColor}
      features={[]}
    />
  );
}
