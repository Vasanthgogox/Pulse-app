/**
 * Load Center underline tabs — Trips hub interaction with illustration colors
 * (yellow main, blue status, pink done subs).
 */
import {
  LOAD_CENTER_TAB_STRIP_PALETTES,
  type LoadCenterTabStripPalette,
  type LoadCenterTabStripVariant,
} from "@/lib/loadCenterTabStripPalettes";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type LoadCenterTabStripItem = {
  key: string;
  label: string;
  count: number;
};

type TabProps = {
  label: string;
  isActive: boolean;
  onPress: () => void;
  palette: LoadCenterTabStripPalette;
  compact?: boolean;
  accessibilityLabel?: string;
};

export function LoadCenterUnderlineTab({
  label,
  isActive,
  onPress,
  palette,
  compact = false,
  accessibilityLabel,
}: TabProps) {
  return (
    <TouchableOpacity
      style={[styles.tabItem, compact && styles.tabItemCompact]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.tabLabel,
          compact && styles.tabLabelCompact,
          { color: isActive ? palette.text : palette.textMuted },
          isActive && styles.tabLabelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {isActive ? (
        <View
          style={[
            styles.tabUnderline,
            compact && styles.tabUnderlineCompact,
            { backgroundColor: palette.underline },
          ]}
        />
      ) : null}
    </TouchableOpacity>
  );
}

type StripProps = {
  tabs: readonly LoadCenterTabStripItem[];
  activeKey: string;
  onChange: (key: string) => void;
  formatLabel?: (label: string, count: number) => string;
  variant?: LoadCenterTabStripVariant;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scrollable?: boolean;
};

const defaultFormat = (label: string, count: number) => `${label} (${count})`;

export function LoadCenterUnderlineTabStrip({
  tabs,
  activeKey,
  onChange,
  formatLabel = defaultFormat,
  variant = "yellow",
  compact = false,
  style,
  contentStyle,
  scrollable = false,
}: StripProps) {
  const palette = LOAD_CENTER_TAB_STRIP_PALETTES[variant];

  const row = (
    <View style={[styles.row, contentStyle]}>
      {tabs.map((tab) => {
        const active = activeKey === tab.key;
        return (
          <LoadCenterUnderlineTab
            key={tab.key}
            label={formatLabel(tab.label, tab.count)}
            isActive={active}
            onPress={() => onChange(tab.key)}
            palette={palette}
            compact={compact}
            accessibilityLabel={`${tab.label}, ${tab.count}`}
          />
        );
      })}
    </View>
  );

  if (!scrollable) {
    return <View style={style}>{row}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={style}
      contentContainerStyle={contentStyle}
    >
      {tabs.map((tab) => {
        const active = activeKey === tab.key;
        return (
          <LoadCenterUnderlineTab
            key={tab.key}
            label={formatLabel(tab.label, tab.count)}
            isActive={active}
            onPress={() => onChange(tab.key)}
            palette={palette}
            compact={compact}
            accessibilityLabel={`${tab.label}, ${tab.count}`}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  tabItem: {
    position: "relative",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    marginRight: 2,
    justifyContent: "flex-end",
    minHeight: 34,
  },
  tabItemCompact: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 7,
    minHeight: 30,
    marginRight: 0,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  tabLabelCompact: {
    fontSize: 11,
    letterSpacing: -0.25,
  },
  tabLabelActive: {
    fontWeight: "600",
  },
  tabUnderline: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
  tabUnderlineCompact: {
    left: 8,
    right: 8,
    height: 2,
  },
});
