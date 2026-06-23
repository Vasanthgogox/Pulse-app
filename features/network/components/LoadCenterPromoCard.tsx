/**
 * Load Center empty-state banner — borderless hero on white body.
 */
import { HubEmptyPromoLayout } from "@/components/hub/HubEmptyPromoLayout";
import {
  LOAD_CENTER_PROMO_PRESETS,
  TripsPromoIcons,
  fitLoadCenterIllustration,
  type LoadCenterPromoVariant,
} from "@/lib/loadCenterPromoAssets";
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
  const preset = LOAD_CENTER_PROMO_PRESETS[variant];
  const featureIconSize = isDesktop ? 14 : 12;

  return (
    <HubEmptyPromoLayout
      style={style}
      title={preset.title}
      description={preset.description}
      Illustration={preset.illustration}
      illustrationAspect={preset.aspect}
      fitIllustration={fitLoadCenterIllustration}
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
