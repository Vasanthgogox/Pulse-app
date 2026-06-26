import LottieView, { type AnimationObject } from "lottie-react-native";
import { StyleSheet, View } from "react-native";

/** Lottie JSONs include generous canvas padding — render larger than the slot. */
const LOTTIE_RENDER_SCALE = 1.85;

export function ClientAnalyticsKpiLottie({
  source,
  size = 36,
  renderScale = LOTTIE_RENDER_SCALE,
}: {
  source: AnimationObject;
  size?: number;
  renderScale?: number;
}) {
  const renderSize = Math.round(size * renderScale);
  return (
    <View style={[styles.slot, { width: size, height: size }]}>
      <LottieView
        source={source}
        autoPlay
        loop
        speed={0.85}
        resizeMode="contain"
        style={{
          width: renderSize,
          height: renderSize,
          position: "absolute",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
});
