import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useWindowDimensions } from "react-native";
import {
  FINANCE_PRO_CONTENT_MAX_WIDTH,
  financeProGutter,
} from "./financeProLayout";

/** Shared left/right edges for Finance Pro chrome, tabs, and pages. */
export function FinanceProAlign({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const gutter = financeProGutter(width);
  return (
    <View
      style={[
        styles.align,
        { paddingHorizontal: gutter },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  align: {
    width: "100%",
    maxWidth: FINANCE_PRO_CONTENT_MAX_WIDTH,
    alignSelf: "center",
    minWidth: 0,
  },
});
