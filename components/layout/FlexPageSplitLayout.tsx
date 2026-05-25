import Theme from "@/constants/Theme";
import React from "react";
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

const SPLIT_MIN_WIDTH = 720;
/** Narrow hub (~35%), wide detail pane (~65%) — matches workspace split UI. */
const HUB_WIDTH_RATIO = 0.35;
const HUB_MAX_WIDTH = 400;

type Props = {
  hub: React.ReactNode;
  panel?: React.ReactNode;
  panelOpen: boolean;
  onClosePanel: () => void;
  style?: ViewStyle;
};

/**
 * Full-page flex shell: narrow hub (~35%) + wide detail pane (~65%).
 * Tap the hub area while the pane is open to dismiss it.
 */
export function FlexPageSplitLayout({
  hub,
  panel,
  panelOpen,
  onClosePanel,
  style,
}: Props) {
  const { width } = useWindowDimensions();
  const useSplit = width >= SPLIT_MIN_WIDTH && panelOpen && !!panel;
  const hubWidth = Math.min(Math.round(width * HUB_WIDTH_RATIO), HUB_MAX_WIDTH);
  const panelWidth = width - hubWidth;

  if (!panelOpen || !panel) {
    return (
      <View style={[styles.screen, style]}>
        <View style={styles.hubOnly}>{hub}</View>
      </View>
    );
  }

  if (!useSplit) {
    return (
      <View style={[styles.screen, style]}>
        <View style={styles.mobilePanel}>{panel}</View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, styles.row, style]}>
      <Pressable
        style={[styles.hubPane, { width: hubWidth, maxWidth: hubWidth }]}
        onPress={onClosePanel}
        accessibilityRole="button"
        accessibilityLabel="Close detail panel"
      >
        <View style={styles.hubPaneInner} pointerEvents="box-none">
          {hub}
        </View>
      </Pressable>
      <View
        style={[
          styles.detailPane,
          {
            width: panelWidth,
            maxWidth: panelWidth,
          },
        ]}
      >
        {panel}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 0,
  },
  hubOnly: {
    flex: 1,
    minWidth: 0,
  },
  hubPane: {
    minWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  hubPaneInner: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  detailPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#f4f6fb",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderLight,
    overflow: "hidden",
  },
  mobilePanel: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.surface,
  },
});
