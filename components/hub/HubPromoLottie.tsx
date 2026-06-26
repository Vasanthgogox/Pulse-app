import LottieView, { type AnimationObject } from "lottie-react-native";
import { Platform, StyleSheet, View } from "react-native";

/** Small orbit-chip Lottie — fixed slot, clipped on web. */
export function HubPromoLottieIcon({
  source,
  size,
}: {
  source: AnimationObject;
  size: number;
}) {
  return (
    <View style={[styles.chipSlot, { width: size, height: size }]}>
      <LottieView
        source={source}
        autoPlay
        loop
        resizeMode="contain"
        style={{ width: size, height: size }}
      />
    </View>
  );
}

/** Hero Lottie — fixed slot with optional inner scale for visual normalization. */
export function HubPromoHeroLottie({
  source,
  width,
  height,
  renderScale = 1,
}: {
  source: AnimationObject;
  width: number;
  height: number;
  renderScale?: number;
}) {
  const renderW = Math.round(width * renderScale);
  const renderH = Math.round(height * renderScale);
  return (
    <View style={[styles.heroSlot, { width, height, maxWidth: width, maxHeight: height }]}>
      <LottieView
        source={source}
        autoPlay
        loop
        resizeMode="contain"
        style={[
          {
            width: renderW,
            height: renderH,
            position: "absolute",
          },
          Platform.OS === "web" ? styles.heroLottieWeb : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chipSlot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  heroSlot: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroLottieWeb: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  } as object,
});
