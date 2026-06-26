/**
 * Payment-type glyphs — crisp strip icons + larger asset tiles for wizard grids.
 */
import LottieView, { type AnimationObject } from "lottie-react-native";
import { memo } from "react";
import { Image, StyleSheet, View } from "react-native";

import { getPaymentTypeAsset } from "@/components/ledger/paymentTypeAssets.util";
import { ledgerPaymentTypeVisual } from "@/components/ledger/paymentTypeVisuals.util";

const STRIP_LUCIDE_STROKE = 2.25;
/** Below this size, Lottie padding makes glyphs unreadable — use strip PNG / Lucide. */
const STRIP_ASSET_MAX = 26;

export type PaymentTypeLogoProps = {
  kind: string;
  size?: number;
};

export const PaymentTypeStripGlyph = memo(function PaymentTypeStripGlyph({
  kind,
  size = 28,
}: PaymentTypeLogoProps) {
  const visual = ledgerPaymentTypeVisual(kind);
  const iconPx = Math.round(size * 0.52);

  if (visual.stripPng) {
    const img = Math.round(size * (visual.stripPngScale ?? 0.9));
    return (
      <Image
        source={visual.stripPng}
        resizeMode="contain"
        style={{ width: img, height: img }}
      />
    );
  }

  const Icon = visual.Icon;
  return <Icon size={iconPx} color={visual.color} strokeWidth={STRIP_LUCIDE_STROKE} />;
});

function paymentTypeLucideGlyph(kind: string, size: number) {
  const visual = ledgerPaymentTypeVisual(kind);
  const iconPx = Math.round(size * 0.55);
  const Icon = visual.Icon;
  return <Icon size={iconPx} color={visual.color} strokeWidth={STRIP_LUCIDE_STROKE} />;
}

export const PaymentTypeLogo = memo(function PaymentTypeLogo({
  kind,
  size = 32,
}: PaymentTypeLogoProps) {
  if (size <= STRIP_ASSET_MAX) {
    return (
      <View style={[styles.slot, { width: size, height: size }]}>
        <PaymentTypeStripGlyph kind={kind} size={size} />
      </View>
    );
  }

  const asset = getPaymentTypeAsset(kind);

  if (!asset) {
    return (
      <View style={[styles.slot, { width: size, height: size }]}>
        {paymentTypeLucideGlyph(kind, size)}
      </View>
    );
  }

  const glyphScale = asset.glyphScale ?? 1.08;
  const glyphSize = Math.round(size * glyphScale);

  if (asset.kind === "png") {
    return (
      <View style={[styles.slot, { width: size, height: size }]}>
        <Image
          source={asset.source}
          resizeMode="contain"
          style={{ width: glyphSize, height: glyphSize }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.slot, { width: size, height: size }]}>
      <LottieView
        source={asset.source as AnimationObject}
        autoPlay
        loop
        speed={asset.speed ?? 1}
        resizeMode="contain"
        style={{ width: glyphSize, height: glyphSize }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
