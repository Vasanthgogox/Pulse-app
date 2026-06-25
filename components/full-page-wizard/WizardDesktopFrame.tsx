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
  const mergedLeftInsights = showRails
    ? [...leftInsights, ...rightInsights]
    : [];
  const hasLeft = showRails && mergedLeftInsights.length > 0;
  const hasRight = showRails && contextPanel != null;

  if (!hasLeft && !hasRight) {
    return <View style={styles.desktopFrameSingle}>{children}</View>;
  }

  return (
    <View style={styles.desktopFrameRow}>
      {hasLeft ? <WizardInsightRail cards={mergedLeftInsights} side="left" /> : null}
      <View style={styles.desktopFrameMain}>{children}</View>
      {hasRight ? (
        <View style={styles.desktopInsightRailRightStack}>
          {contextPanel ? (
            <View style={styles.desktopContextPanel}>{contextPanel}</View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
