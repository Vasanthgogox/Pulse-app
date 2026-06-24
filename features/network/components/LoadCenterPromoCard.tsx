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
import LottieView from "lottie-react-native";
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

  const renderFeatureIcon = (label: string, icon: keyof typeof TripsPromoIcons) => {
    const animatedSize = featureIconSize + 8;
    if (variant === "claimed_awarded") {
      if (label === "Award confirmed") {
        return (
          <LottieView
            source={require("@/assets/Animated folder/recipt check.json")}
            autoPlay
            loop
            style={{ width: animatedSize, height: animatedSize }}
          />
        );
      }
      if (label === "Assign staff") {
        return (
          <LottieView
            source={require("@/assets/Animated folder/add-user.json")}
            autoPlay
            loop
            style={{ width: animatedSize, height: animatedSize }}
          />
        );
      }
      if (label === "Deploy vehicle") {
        return (
          <LottieView
            source={require("@/assets/Animated folder/truck-loading.json")}
            autoPlay
            loop
            style={{ width: animatedSize, height: animatedSize }}
          />
        );
      }
      if (label === "Share indent") {
        return (
          <LottieView
            source={require("@/assets/Animated folder/note-saved.json")}
            autoPlay
            loop
            style={{ width: animatedSize, height: animatedSize }}
          />
        );
      }
    }
    if (variant === "claimed_done_rejected") {
      if (label === "Closed award") {
        return (
          <LottieView
            source={require("@/assets/Animated folder/law approved.json")}
            autoPlay
            loop
            style={{ width: animatedSize, height: animatedSize }}
          />
        );
      }
      if (label === "No trip created") {
        return (
          <LottieView
            source={require("@/assets/Animated folder/web-error.json")}
            autoPlay
            loop
            style={{ width: animatedSize, height: animatedSize }}
          />
        );
      }
      if (label === "Audit trail") {
        return (
          <LottieView
            source={require("@/assets/Animated folder/note-saved.json")}
            autoPlay
            loop
            style={{ width: animatedSize, height: animatedSize }}
          />
        );
      }
      if (label === "Reference only") {
        return (
          <LottieView
            source={require("@/assets/Animated folder/user-info.json")}
            autoPlay
            loop
            style={{ width: animatedSize, height: animatedSize }}
          />
        );
      }
    }
    const IconAsset = TripsPromoIcons[icon];
    return <IconAsset width={featureIconSize} height={featureIconSize} />;
  };

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
        return {
          key: label,
          label,
          icon: renderFeatureIcon(label, icon),
        };
      })}
    />
  );
}
