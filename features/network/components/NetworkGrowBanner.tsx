/**
 * Grow your network — simple promo card (matches help / support banner style).
 */
import Theme from "@/constants/Theme";
import Illustration9 from "@/assets/illustrations/9.svg";
import { StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from "react-native";

const ILLUS_ASPECT = 600 / 436;

function fitIllustration(boxW: number, boxH: number) {
  let w = boxW;
  let h = w / ILLUS_ASPECT;
  if (h > boxH) {
    h = boxH;
    w = h * ILLUS_ASPECT;
  }
  return { width: w, height: h };
}

export type NetworkGrowBannerProps = {
  style?: ViewStyle;
};

export function NetworkGrowBanner({ style }: NetworkGrowBannerProps) {
  const { width } = useWindowDimensions();
  const illusBoxW = width < 400 ? 108 : 124;
  const illusBoxH = width < 400 ? 88 : 100;
  const illusSize = fitIllustration(illusBoxW, illusBoxH);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.body}>
        <View style={styles.textCol}>
          <Text style={styles.title}>Grow your network</Text>
          <Text style={styles.description}>
            Connect with clients, suppliers, and fleet owners you already work
            with on Pulse.
          </Text>
        </View>
        <View style={styles.illusWrap}>
          <Illustration9 width={illusSize.width} height={illusSize.height} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 120,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  description: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  illusWrap: {
    width: 112,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "visible",
  },
});
