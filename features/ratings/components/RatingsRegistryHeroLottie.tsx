import LottieView from "lottie-react-native";
import { StyleSheet, View } from "react-native";

const BADGE_LOTTIE = require("@/assets/Animated folder/medal.json");

const GLYPH_SCALE = 1.18;

export function RatingsRegistryHeroLottie({
  iconSize = 48,
}: {
  iconSize?: number;
}) {
  const dim = Math.round(iconSize * GLYPH_SCALE);

  return (
    <View style={styles.slot}>
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
    overflow: "visible",
    flexShrink: 0,
  },
});
