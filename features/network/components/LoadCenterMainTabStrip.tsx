/**
 * Load Center tab strips — illustration ink outline (yellow main, blue status, pink done).
 */
import Theme from "@/constants/Theme";
import {
  LOAD_CENTER_TAB_STRIP_PALETTES,
  type LoadCenterTabStripVariant,
} from "@/lib/loadCenterTabStripPalettes";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type LoadCenterMainTabKey = "GIVE_LOAD" | "GET_LOAD" | "AWARDED";

export type LoadCenterTabStripItem = {
  key: string;
  label: string;
  count: number;
};

type Props = {
  tabs: readonly LoadCenterTabStripItem[];
  activeKey: string;
  onChange: (key: string) => void;
  formatLabel?: (label: string, count: number) => string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  variant?: LoadCenterTabStripVariant;
  /** Size pills to label width instead of equal flex columns. */
  hug?: boolean;
};

const defaultFormat = (label: string, count: number) =>
  `${label} (${count})`;

export function LoadCenterMainTabStrip({
  tabs,
  activeKey,
  onChange,
  formatLabel = defaultFormat,
  style,
  compact = false,
  variant = "yellow",
  hug = false,
}: Props) {
  const palette = LOAD_CENTER_TAB_STRIP_PALETTES[variant];

  return (
    <View
      style={[
        styles.tray,
        compact && styles.trayCompact,
        { backgroundColor: palette.trayBg, borderColor: palette.trayBorder },
        hug && styles.trayHug,
        style,
      ]}
    >
      {tabs.map((tab) => {
        const active = activeKey === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.pill,
              compact && styles.pillCompact,
              hug && styles.pillHug,
              active
                ? [
                    styles.pillActive,
                    {
                      backgroundColor: palette.bg,
                      borderColor: palette.border,
                    },
                  ]
                : [
                    styles.pillIdle,
                    {
                      backgroundColor: palette.bgIdle,
                      borderColor: palette.borderSoft,
                    },
                  ],
              pressed && styles.pillPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${tab.label}, ${tab.count}`}
          >
            <Text
              style={[
                styles.label,
                compact && styles.labelCompact,
                active
                  ? [styles.labelActive, { color: palette.text }]
                  : [styles.labelIdle, { color: palette.textMuted }],
              ]}
              numberOfLines={1}
            >
              {formatLabel(tab.label, tab.count)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const trayShadow = Platform.select({
  ios: {
    shadowColor: Theme.loadMainTabBorder,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  android: { elevation: 1 },
  web: {
    boxShadow: "0 1px 4px rgba(77, 54, 54, 0.06)",
  },
  default: {},
});

const activePillShadow = Platform.select({
  ios: {
    shadowColor: Theme.loadMainTabBorder,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  android: { elevation: 2 },
  web: {
    boxShadow: "0 2px 6px rgba(77, 54, 54, 0.1)",
  },
  default: {},
});

const styles = StyleSheet.create({
  tray: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    ...trayShadow,
  },
  trayCompact: {
    gap: 5,
    padding: 3,
  },
  trayHug: {
    alignSelf: "flex-start",
  },
  pill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pillHug: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    minWidth: 0,
    paddingHorizontal: 12,
  },
  pillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 32,
  },
  pillIdle: {},
  pillActive: {
    borderWidth: 2,
    ...activePillShadow,
  },
  pillPressed: {
    opacity: 0.92,
  },
  label: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    textAlign: "center",
  },
  labelCompact: {
    fontSize: 8,
    letterSpacing: 0.45,
  },
  labelIdle: {},
  labelActive: {
    fontWeight: "700",
  },
});
