import { hubScreenBottomBarStyles as styles } from "@/components/hub/hubScreenBottomBar.styles";
import type { ReactNode } from "react";
import { View } from "react-native";

type HubScreenBottomBarProps = {
  /** Left cluster (e.g. Fleet confidence). */
  left?: ReactNode;
  /** Center cluster (e.g. pagination controls). */
  center?: ReactNode;
  /** Right cluster (e.g. Export). */
  right?: ReactNode;
  /** Full-width single row (e.g. loads pagination meta + controls). */
  children?: ReactNode;
};

export function HubScreenBottomBar({
  left,
  center,
  right,
  children,
}: HubScreenBottomBarProps) {
  if (children != null) {
    return (
      <View style={styles.shell}>
        <View style={[styles.row, styles.full]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.row}>
        {left ? <View style={styles.left}>{left}</View> : null}
        {center ? <View style={styles.center}>{center}</View> : null}
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}
