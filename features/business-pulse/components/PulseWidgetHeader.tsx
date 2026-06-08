import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";

type Props = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

/** Metronic-style widget card header — icon chip + title + optional right meta. */
export function PulseWidgetHeader({ icon, title, subtitle, rightSlot }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.iconChip}>{icon}</View>
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  left: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(79,70,229,0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  right: {
    flexShrink: 0,
    maxWidth: "42%",
    alignItems: "flex-end",
  },
});
