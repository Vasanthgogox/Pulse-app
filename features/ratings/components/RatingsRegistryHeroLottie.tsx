import LottieView from "lottie-react-native";
import { StyleSheet, View } from "react-native";

const BADGE_LOTTIE = require("@/assets/Animated folder/medal.json");

export function RatingsRegistryHeroLottie({
  iconSize = 36,
}: {
  iconSize?: number;
}) {
  const dim = Math.round(iconSize);

  return (
    <View style={[styles.slot, { width: dim, height: dim }]}>
      <LottieView
        source={BADGE_LOTTIE}
        autoPlay
        loop
        speed={0.9}
        resizeMode="contain"
        style={{ width: dim, height: dim }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
});
