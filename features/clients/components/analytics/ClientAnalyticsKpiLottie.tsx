import LottieView, { type AnimationObject } from "lottie-react-native";
import { StyleSheet, View } from "react-native";

export function ClientAnalyticsKpiLottie({
  source,
  size = 28,
}: {
  source: AnimationObject;
  size?: number;
}) {
  const lottieSize = Math.round(size * 1.15);
  return (
    <View style={[styles.slot, { width: size, height: size }]}>
      <LottieView
        source={source}
        autoPlay
        loop
        speed={0.85}
        resizeMode="contain"
        style={{ width: lottieSize, height: lottieSize }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
