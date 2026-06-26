import { entityDetailPageChromeStyles } from "@/components/entityDetailPageChrome.styles";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import { EMPTY_STATE_LOTTIE } from "@/lib/emptyStateLottieAssets";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";

type EntityTripTableEmptyRowProps = {
  label?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function EntityTripTableEmptyRow({
  label = "No trips",
  style,
  textStyle,
}: EntityTripTableEmptyRowProps) {
  return (
    <View style={[entityDetailPageChromeStyles.emptyRow, style]}>
      <TinyEmptyLottie source={EMPTY_STATE_LOTTIE.tripsTable} size={36} />
      <Text style={[entityDetailPageChromeStyles.emptyRowText, textStyle]}>
        {label}
      </Text>
    </View>
  );
}
