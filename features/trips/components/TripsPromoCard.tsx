/**
 * Trips hub empty-state banner — borderless hero on transparent body.
 */
import { HubEmptyPromoLayout } from "@/components/hub/HubEmptyPromoLayout";
import {
  TRIPS_PROMO_PRESETS,
  TripsPromoIcons,
  fitTripsIllustration,
  type TripsPromoVariant,
} from "@/lib/tripsPromoAssets";
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
  const preset = TRIPS_PROMO_PRESETS[variant];
  const featureIconSize = isDesktop ? 14 : 12;

  return (
    <HubEmptyPromoLayout
      style={style}
      title={preset.title}
      description={preset.description}
      Illustration={preset.illustration}
      illustrationAspect={preset.aspect}
      fitIllustration={fitTripsIllustration}
      illustrationScale={0.9}
      ctaLabel={preset.ctaLabel}
      onCtaPress={onCtaPress}
      features={preset.bullets.map(({ label, icon }) => {
        const IconAsset = TripsPromoIcons[icon];
        return {
          key: label,
          label,
          icon: <IconAsset width={featureIconSize} height={featureIconSize} />,
        };
      })}
    />
  );
}
