/**
 * 50:50 split for Grow your network + People you may know (2-up list rows per pane).
 */
import {
  NETWORK_HUB_GRID_GAP_PX,
  NETWORK_HUB_GRID_ROW_PADDING_H,
  NETWORK_HUB_PANE_HEADER_MIN_HEIGHT,
  NETWORK_HUB_SPLIT_COLUMN_GAP_PX,
} from "@/features/network/constants/networkHubGrid";
import Theme from "@/constants/Theme";
import { StyleSheet, View, type ViewStyle } from "react-native";

const SPLIT_BREAKPOINT = 820;

export type NetworkHubSplitLayoutProps = {
  windowWidth: number;
  left: React.ReactNode;
  right: React.ReactNode;
  leftHeader?: React.ReactNode;
  rightHeader?: React.ReactNode;
  style?: ViewStyle;
};

export function NetworkHubSplitLayout({
  windowWidth,
  left,
  right,
  leftHeader,
  rightHeader,
  style,
}: NetworkHubSplitLayoutProps) {
  const stack = windowWidth < SPLIT_BREAKPOINT;

  return (
    <View
      style={[networkHubSplitStyles.root, stack && networkHubSplitStyles.rootStack, style]}
    >
      <View style={[networkHubSplitStyles.pane, stack && networkHubSplitStyles.paneStack]}>
        {leftHeader ? (
          <View style={networkHubSplitStyles.paneHeader}>{leftHeader}</View>
        ) : null}
        {left}
      </View>
      <View
        style={[
          networkHubSplitStyles.pane,
          stack && networkHubSplitStyles.paneStack,
          stack && networkHubSplitStyles.paneStackFollow,
        ]}
      >
        {rightHeader ? (
          <View style={networkHubSplitStyles.paneHeader}>{rightHeader}</View>
        ) : null}
        {right}
      </View>
    </View>
  );
}

export const networkHubSplitStyles = StyleSheet.create({
  root: {
    flexDirection: "row",
    width: "100%",
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    gap: NETWORK_HUB_SPLIT_COLUMN_GAP_PX,
    alignItems: "flex-start",
  },
  rootStack: {
    flexDirection: "column",
    gap: 24,
  },
  paneHeader: {
    marginBottom: 8,
    gap: 2,
    width: "100%",
    minHeight: NETWORK_HUB_PANE_HEADER_MIN_HEIGHT,
    justifyContent: "flex-end",
  },
  paneHeaderSpacer: {
    width: "100%",
    minHeight: NETWORK_HUB_PANE_HEADER_MIN_HEIGHT,
    marginBottom: 8,
  },
  pane: {
    flex: 1,
    minWidth: 0,
  },
  paneStack: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  paneStackFollow: {
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  paneList: {
    width: "100%",
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  paneListGrid: {
    width: "100%",
    gap: 10,
  },
  paneListRow: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  paneListRowSingle: {
    gap: 0,
  },
  paneListCell: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  paneListCellFull: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "100%",
  },
});
