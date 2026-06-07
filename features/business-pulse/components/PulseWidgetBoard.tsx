import { memo, type ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";

/** Desktop breakpoints for Business Pulse dashboard composition. */
export function usePulseDesktopLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const isWideDesktop = Platform.OS === "web" && width >= 1280;
  return { isDesktop, isWideDesktop, width };
}

export type PulseWidgetRowProps = {
  children: ReactNode;
  /** When false, always stack (e.g. mobile-first section). */
  splitOnDesktop?: boolean;
};

/** Side-by-side on desktop web; stacked on mobile / narrow. */
export const PulseWidgetRow = memo(function PulseWidgetRow({
  children,
  splitOnDesktop = true,
}: PulseWidgetRowProps) {
  const { isDesktop } = usePulseDesktopLayout();
  const split = splitOnDesktop && isDesktop;
  return (
    <View style={[boardStyles.row, split ? boardStyles.rowSplit : boardStyles.rowStack]}>
      {children}
    </View>
  );
});

export type PulseWidgetColProps = {
  children: ReactNode;
  /** Relative width when inside a split row (default equal halves). */
  flex?: number;
  minWidth?: number;
  maxWidth?: number;
};

export const PulseWidgetCol = memo(function PulseWidgetCol({
  children,
  flex = 1,
  minWidth,
  maxWidth,
}: PulseWidgetColProps) {
  return (
    <View
      style={[
        boardStyles.col,
        { flex, minWidth: minWidth ?? 0, maxWidth },
      ]}
    >
      {children}
    </View>
  );
});

const boardStyles = StyleSheet.create({
  row: {
    gap: 12,
    alignItems: "stretch",
  },
  rowStack: {
    flexDirection: "column",
  },
  rowSplit: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  col: {
    minWidth: 0,
  },
});
