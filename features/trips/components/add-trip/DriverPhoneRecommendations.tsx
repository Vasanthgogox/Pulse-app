import { memo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { CheckCircle2, User } from "lucide-react-native";

import Theme from "@/constants/Theme";
import type { ExistingDriverMatch } from "@/features/drivers/services/drivers.service";

export type DriverPhoneRecommendationsProps = {
  matches: readonly ExistingDriverMatch[];
  loading: boolean;
  selectedUserId: string | null;
  onSelect: (match: ExistingDriverMatch) => void;
  phoneComplete: boolean;
  /** Tighter typography for mobile / dense forms. */
  compact?: boolean;
  /** Web desktop: recommendations beside the phone field. */
  layout?: "stack" | "aside";
  /** Override empty-state body copy (e.g. desktop: name field is below). */
  emptyHint?: string;
};

export const DriverPhoneRecommendations = memo(function DriverPhoneRecommendations({
  matches,
  loading,
  selectedUserId,
  onSelect,
  phoneComplete,
  compact = false,
  layout = "stack",
  emptyHint,
}: DriverPhoneRecommendationsProps) {
  if (!phoneComplete) return null;

  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;
  const wrapStyle = [
    styles.wrap,
    layout === "aside" && styles.wrapAside,
    compact && styles.wrapCompact,
  ];
  const rowStyle = (active: boolean) => [
    styles.row,
    compact && styles.rowCompact,
    active && styles.rowActive,
    webCursor,
  ];

  if (loading) {
    return (
      <View style={wrapStyle}>
        <ActivityIndicator size="small" color={Theme.primary} />
        <Text style={[styles.loadingText, compact && styles.loadingTextCompact]}>
          Looking up driver on Pulse…
        </Text>
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={[styles.emptyWrap, compact && styles.emptyWrapCompact]}>
        <Text style={[styles.emptyTitle, compact && styles.emptyTitleCompact]}>
          No driver profile for this number
        </Text>
        <Text style={[styles.emptySub, compact && styles.emptySubCompact]}>
          {emptyHint ??
            "Enter the driver name on the next step, or invite them to Pulse first."}
        </Text>
      </View>
    );
  }

  return (
    <View style={wrapStyle}>
      <Text style={[styles.sectionLabel, compact && styles.sectionLabelCompact]}>
        {matches.length === 1 ? "Recommended driver" : "Select driver"}
      </Text>
      <View style={layout === "aside" && matches.length > 1 ? styles.gridAside : undefined}>
      {matches.map((m) => {
        const active = selectedUserId === m.user_id;
        const label = m.full_name?.trim() || "Driver";
        return (
          <Pressable
            key={m.user_id}
            style={rowStyle(active)}
            onPress={() => onSelect(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <View style={[styles.avatar, active && styles.avatarActive]}>
              <User size={16} color={active ? Theme.buttonPrimaryText : Theme.iconPrimary} />
            </View>
            <View style={styles.rowText}>
              <Text
                style={[styles.name, compact && styles.nameCompact, active && styles.nameActive]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {m.is_in_fleet ? (
                <Text style={[styles.meta, compact && styles.metaCompact, active && styles.metaActive]}>
                  In your fleet
                </Text>
              ) : (
                <Text style={[styles.meta, compact && styles.metaCompact, active && styles.metaActive]}>
                  On Pulse platform
                </Text>
              )}
            </View>
            {active ? (
              <CheckCircle2 size={compact ? 16 : 18} color={Theme.textOnPrimary} />
            ) : null}
          </Pressable>
        );
      })}
      </View>
      {!selectedUserId ? (
        <Text style={[styles.hint, compact && styles.hintCompact]}>
          {Platform.OS === "web" ? "Click" : "Tap"} a name to use it for this trip
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  wrapAside: {
    marginTop: 0,
    flex: 1,
    minWidth: 0,
  },
  wrapCompact: {
    marginTop: 6,
    gap: 6,
  },
  gridAside: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  emptyWrap: {
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 6,
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textMuted,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minWidth: 0,
    ...Platform.select({
      web: { flexGrow: 1, flexBasis: "min(100%, 280px)" } as ViewStyle,
      default: {},
    }),
  },
  rowCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  rowActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.buttonPrimary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  nameActive: {
    color: Theme.buttonPrimaryText,
  },
  meta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
  },
  metaActive: {
    color: "rgba(255,255,255,0.85)",
  },
  hint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 2,
  },
  hintCompact: {
    fontSize: 10,
  },
  loadingTextCompact: {
    fontSize: 11,
  },
  emptyWrapCompact: {
    padding: 8,
    marginTop: 6,
  },
  emptyTitleCompact: {
    fontSize: 12,
  },
  emptySubCompact: {
    fontSize: 11,
  },
  sectionLabelCompact: {
    fontSize: 9,
  },
  nameCompact: {
    fontSize: 14,
  },
  metaCompact: {
    fontSize: 10,
  },
});
