import LottieView from "lottie-react-native";
import { StyleSheet, View } from "react-native";

type TinyEmptyLottieProps = {
  source: object;
  size?: number;
  speed?: number;
};

export function TinyEmptyLottie({
  source,
  size = 40,
  speed = 0.85,
}: TinyEmptyLottieProps) {
  return (
    <View style={[styles.slot, { width: size, height: size }]}>
      <LottieView
        source={source}
        autoPlay
        loop
        speed={speed}
        resizeMode="contain"
        style={{ width: size, height: size }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
  },
});
