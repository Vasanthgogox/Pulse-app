/**
 * ScoreMeterRow — side-by-side score card + gauge with matched heights.
 */
import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { analyticsPanelStyles } from "./analyticsLayout";

export interface ScoreMeterRowProps {
  score: ReactNode;
  meter: ReactNode;
}

export const ScoreMeterRow = memo(function ScoreMeterRow({
  score,
  meter,
}: ScoreMeterRowProps) {
  return (
    <View style={analyticsPanelStyles.scoreRow}>
      <View style={analyticsPanelStyles.scoreCol}>{score}</View>
      <View style={analyticsPanelStyles.scoreCol}>
        <View style={styles.meterFill}>{meter}</View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  meterFill: {
    flex: 1,
    justifyContent: "center",
  },
});
