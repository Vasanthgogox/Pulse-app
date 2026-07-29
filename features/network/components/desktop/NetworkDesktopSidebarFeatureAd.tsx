/**
 * Network sidebar feature ads — elegant square fillers with topic-matched
 * Lottie / product illustrations (never error-page sketches).
 */
import Theme from "@/constants/Theme";
import {
  METRONIC,
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  fitPulseFeatureIllustration,
  pickPulseFeatureAds,
  type PulseFeatureAd,
  type PulseFeatureAdId,
} from "@/lib/pulseFeatureAdAssets";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import LottieView, { type AnimationObject } from "lottie-react-native";
import { ArrowUpRight } from "lucide-react-native";
import { useMemo } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type NetworkDesktopSidebarFeatureAdProps = {
  /**
   * `square` — single tall filler tile.
   * `compact` — shorter horizontal promo.
   * `stack` — two distinct square tiles for tall empty columns.
   */
  layout?: "square" | "compact" | "stack";
  excludeIds?: readonly PulseFeatureAdId[];
};

function FeatureAdArt({
  ad,
  boxW,
  boxH,
}: {
  ad: PulseFeatureAd;
  boxW: number;
  boxH: number;
}) {
  if (ad.lottie) {
    const scale = ad.lottieScale ?? 1.06;
    const size = Math.round(Math.min(boxW, boxH) * scale);
    return (
      <View style={[local.artSlot, { width: boxW, height: boxH }]}>
        <LottieView
          source={ad.lottie as AnimationObject}
          autoPlay
          loop
          speed={0.9}
          resizeMode="contain"
          style={{ width: size, height: size }}
        />
      </View>
    );
  }

  const Illustration = ad.illustration;
  const size = fitPulseFeatureIllustration(boxW, boxH, ad.aspect);
  return (
    <View style={[local.artSlot, { width: boxW, height: boxH }]}>
      <Illustration
        width={size.width}
        height={size.height}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

function FeatureAdTile({
  ad,
  layout,
}: {
  ad: PulseFeatureAd;
  layout: "square" | "compact";
}) {
  const router = useRouter();
  const square = layout === "square";

  const openAd = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(ad.href as never);
  };

  return (
    <Pressable
      onPress={openAd}
      style={({ pressed }) => [
        hubStyles.salesCard,
        square ? local.squareCard : local.compactCard,
        { backgroundColor: ad.wash },
        pressed && local.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${ad.title} — ${ad.sub}`}
    >
      <View style={square ? local.squareInner : local.compactInner}>
        {square ? (
          <View style={local.squareRow}>
            <View style={local.copyBlock}>
              <Text style={[local.chip, { color: ad.accent }]}>{ad.chip}</Text>
              <Text style={local.squareTitle} numberOfLines={2}>
                {ad.title}
              </Text>
              <Text style={local.squareSub} numberOfLines={2}>
                {ad.sub}
              </Text>
              <View style={local.ctaPill}>
                <Text style={[local.cta, { color: ad.accent }]}>{ad.cta}</Text>
                <ArrowUpRight size={13} color={ad.accent} strokeWidth={2.3} />
              </View>
            </View>
            <FeatureAdArt ad={ad} boxW={88} boxH={72} />
          </View>
        ) : (
          <View style={local.compactRow}>
            <View style={local.copyBlock}>
              <Text style={[local.chip, { color: ad.accent }]}>{ad.chip}</Text>
              <Text style={local.compactTitle} numberOfLines={2}>
                {ad.title}
              </Text>
              <Text style={local.compactSub} numberOfLines={2}>
                {ad.sub}
              </Text>
              <View style={local.ctaRow}>
                <Text style={[local.cta, { color: ad.accent }]}>{ad.cta}</Text>
                <ArrowUpRight size={13} color={ad.accent} strokeWidth={2.3} />
              </View>
            </View>
            <FeatureAdArt ad={ad} boxW={84} boxH={68} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const EMPTY_EXCLUDE: readonly PulseFeatureAdId[] = [];

export function NetworkDesktopSidebarFeatureAd({
  layout = "square",
  excludeIds = EMPTY_EXCLUDE,
}: NetworkDesktopSidebarFeatureAdProps) {
  const ads = useMemo(() => {
    const count = layout === "stack" ? 2 : 1;
    return pickPulseFeatureAds(count, { exclude: excludeIds });
    // Mount-stable random pick — do not reshuffle on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  if (ads.length === 0) return null;

  if (layout === "stack") {
    return (
      <View style={local.stack}>
        {ads.map((ad) => (
          <FeatureAdTile key={ad.id} ad={ad} layout="square" />
        ))}
      </View>
    );
  }

  return <FeatureAdTile ad={ads[0]!} layout={layout} />;
}

export const PulseFeatureAdBanner = NetworkDesktopSidebarFeatureAd;

const local = {
  stack: {
    gap: 10,
    width: "100%",
  } satisfies ViewStyle,
  pressed: {
    opacity: 0.94,
  } satisfies ViewStyle,
  squareCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: METRONIC.border,
    overflow: "hidden",
    width: "100%",
  } satisfies ViewStyle,
  compactCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: METRONIC.border,
    overflow: "hidden",
    width: "100%",
  } satisfies ViewStyle,
  squareInner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  } satisfies ViewStyle,
  compactInner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  } satisfies ViewStyle,
  squareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  } satisfies ViewStyle,
  chip: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    alignSelf: "flex-start",
  } satisfies TextStyle,
  artSlot: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    flexShrink: 0,
  } satisfies ViewStyle,
  copyBlock: {
    gap: 5,
    minWidth: 0,
    flex: 1,
  } satisfies ViewStyle,
  squareTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: -0.28,
    lineHeight: 19,
  } satisfies TextStyle,
  squareSub: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 15,
  } satisfies TextStyle,
  compactTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: -0.2,
  } satisfies TextStyle,
  compactSub: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
    lineHeight: 15,
  } satisfies TextStyle,
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  } satisfies ViewStyle,
  ctaPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: METRONIC.border,
  } satisfies ViewStyle,
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  } satisfies ViewStyle,
  cta: {
    fontSize: 12,
    fontWeight: "700",
  } satisfies TextStyle,
};
