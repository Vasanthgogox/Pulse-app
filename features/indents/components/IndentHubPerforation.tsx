import Theme from "@/constants/Theme";
import { indentReviewHubLayout } from "@/features/indents/styles/indentReviewHubStyles";
import { StyleSheet, View } from "react-native";

const NOTCH = 10;

type IndentHubPerforationProps = {
  /** Horizontal padding of the parent card body (notch sits flush with card edge). */
  contentPadding?: number;
  /** Dashed tear line color (e.g. on purple bid tickets). */
  dashColor?: string;
};

/** Ticket-style divider on white hub cards. */
export function IndentHubPerforation({
  contentPadding = indentReviewHubLayout.summaryCardPadding,
  dashColor = Theme.borderLight,
}: IndentHubPerforationProps) {
  const notchOffset = -contentPadding - NOTCH / 2;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.notchLeft, { marginLeft: notchOffset }]} />
      <View style={[styles.dashLine, { borderColor: dashColor }]} />
      <View style={[styles.notchRight, { marginRight: notchOffset }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    height: NOTCH,
    marginTop: 6,
    marginBottom: 6,
  },
  notchLeft: {
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: Theme.screenBackground,
  },
  notchRight: {
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: Theme.screenBackground,
  },
  dashLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
