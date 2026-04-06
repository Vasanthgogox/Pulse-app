import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import Layout from "@/constants/Layout";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type SubTabItem<T extends string> = {
  key: T;
  label: string;
  badgeCount?: number;
};

interface SubTabsProps<T extends string> {
  items: readonly SubTabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  variant?: "dark" | "light";
  horizontalPadding?: number;
  tabMinWidth?: number;
  /** Space between tabs. Default 16. */
  gap?: number;
  /** Layout distribution across the row. Default flex-start. */
  justifyContent?:
    | "flex-start"
    | "flex-end"
    | "center"
    | "space-between"
    | "space-around"
    | "space-evenly";
}

export function SubTabs<T extends string>({
  items,
  value,
  onChange,
  variant = "dark",
  horizontalPadding = Layout.screenPaddingHorizontal,
  tabMinWidth,
  gap = 16,
  justifyContent = "flex-start",
}: SubTabsProps<T>) {
  const isDark = variant === "dark";

  return (
    <View
      style={[
        styles.row,
        isDark ? styles.rowDark : styles.rowLight,
        { paddingHorizontal: horizontalPadding, gap, justifyContent },
      ]}
    >
      {items.map((it) => {
        const active = it.key === value;
        const showBadge = it.badgeCount != null && it.badgeCount > 0;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onChange(it.key)}
            style={[styles.tab, tabMinWidth != null && { minWidth: tabMinWidth }]}
            activeOpacity={0.8}
          >
            <View style={styles.labelRow}>
              <Text
                style={[
                  styles.text,
                  isDark ? styles.textDark : styles.textLight,
                  active && (isDark ? styles.textDarkActive : styles.textLightActive),
                ]}
              >
                {it.label}
              </Text>
              {/* Fixed slot so tabs with/without counts share one baseline row */}
              <View style={styles.badgeSlot}>
                {showBadge ? (
                  <View
                    style={[
                      styles.badge,
                      isDark ? styles.badgeDark : styles.badgeLight,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        isDark ? styles.badgeTextDark : styles.badgeTextLight,
                      ]}
                    >
                      {it.badgeCount}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.badgePlaceholder} />
                )}
              </View>
            </View>
            {active ? (
              <View style={[styles.underline, { backgroundColor: Theme.primary }]} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  rowDark: {
    backgroundColor: Theme.darkBackground,
    borderBottomColor: Theme.separatorDark,
  },
  rowLight: {
    backgroundColor: Theme.screenBackground,
    borderBottomColor: Theme.borderLight,
  },
  tab: {
    position: "relative",
    paddingVertical: 4,
    justifyContent: "center",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 20,
  },
  text: {
    ...Typography.subTabLabel,
    lineHeight: 12,
    paddingVertical: 0,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  badgeSlot: {
    minWidth: 22,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgePlaceholder: {
    width: 18,
    height: 18,
  },
  textDark: { color: Theme.textOnDarkMuted },
  textDarkActive: { color: Theme.textOnDark },
  textLight: { color: Theme.textSecondary },
  textLightActive: { color: Theme.textPrimaryDark },
  underline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  badge: {
    minWidth: 18,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  badgeDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  badgeLight: { backgroundColor: Theme.surface, borderColor: Theme.borderLight },
  badgeText: { fontSize: 10, fontWeight: "800" },
  badgeTextDark: { color: Theme.textOnDarkMuted },
  badgeTextLight: { color: Theme.textSecondary },
});

