import type { ReactNode } from "react";
import { View } from "react-native";

import Layout from "@/constants/Layout";

import { fullPageWizardStyles as styles } from "./fullPageWizardStyles";
import { WizardInsightRail, type WizardInsightCard } from "./WizardInsightRail";

export type WizardDesktopFrameProps = {
  children: ReactNode;
  width: number;
  leftInsights?: WizardInsightCard[];
  rightInsights?: WizardInsightCard[];
  /** Optional contextual panel (trip summary, route, etc.) above right tips. */
  contextPanel?: ReactNode;
};

export function WizardDesktopFrame({
  children,
  width,
  leftInsights = [],
  rightInsights = [],
  contextPanel,
}: WizardDesktopFrameProps) {
  const showRails = width >= Layout.wizardDesktopGridMinWidth;
  const hasLeft = showRails && leftInsights.length > 0;
  const hasRight = showRails && (rightInsights.length > 0 || contextPanel != null);

  if (!hasLeft && !hasRight) {
    return <View style={styles.desktopFrameSingle}>{children}</View>;
  }

  return (
    <View style={styles.desktopFrameRow}>
      {hasLeft ? <WizardInsightRail cards={leftInsights} side="left" /> : null}
      <View style={styles.desktopFrameMain}>{children}</View>
      {hasRight ? (
        <View style={styles.desktopInsightRailRightStack}>
          {contextPanel ? (
            <View style={styles.desktopContextPanel}>{contextPanel}</View>
          ) : null}
          {rightInsights.length > 0 ? (
            <WizardInsightRail cards={rightInsights} side="right" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
