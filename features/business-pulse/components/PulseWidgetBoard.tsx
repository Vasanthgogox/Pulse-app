import { memo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

/** Desktop breakpoints for Business Pulse dashboard composition. */
export function usePulseDesktopLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const isWideDesktop = width >= 1280;
  return { isDesktop, isWideDesktop, width };
}

export type PulseWidgetRowProps = {
  children: ReactNode;
  /** When false, always stack (e.g. mobile-first section). */
  splitOnDesktop?: boolean;
};

/** Side-by-side on desktop; stacked on mobile / narrow. */
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
        {
          flex,
          flexBasis: flex != null ? 0 : undefined,
          minWidth: minWidth ?? 0,
          maxWidth,
        },
      ]}
    >
      {children}
    </View>
  );
});

/** Desktop overview — narrow left rail + flexible main column (Metronic profile layout). */
export const PulseOverviewDesktopLayout = memo(function PulseOverviewDesktopLayout({
  left,
  main,
}: {
  left: ReactNode;
  main: ReactNode;
}) {
  const { isWideDesktop } = usePulseDesktopLayout();
  return (
    <View style={boardStyles.overviewDesktop}>
      <View
        style={[
          boardStyles.overviewLeft,
          isWideDesktop && boardStyles.overviewLeftWide,
        ]}
      >
        {left}
      </View>
      <View style={boardStyles.overviewMain}>{main}</View>
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
    alignSelf: "stretch",
  },
  overviewDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
  },
  overviewLeft: {
    width: 268,
    maxWidth: "28%",
    flexShrink: 0,
    gap: 12,
  },
  overviewLeftWide: {
    width: 288,
    maxWidth: "29%",
  },
  overviewMain: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
});
