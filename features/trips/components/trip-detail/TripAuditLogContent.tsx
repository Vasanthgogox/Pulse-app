/**
 * Trip audit log — dedicated audit trail UI (not notifications).
 * Shows category, action, recorded date/time, who made the entry, and details.
 */
import Theme from "@/constants/Theme";
import type { TripAuditFilterTab } from "@/lib/trips/tripAuditLog.types";
import type { TripAuditLogEntry } from "@/lib/trips/tripAuditLog.types";
import { X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

const TABS: { id: TripAuditFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "payment", label: "Payment" },
  { id: "trip", label: "Trip" },
  { id: "assignment", label: "Assignment" },
];

const CATEGORY_TONE: Record<
  TripAuditLogEntry["category"],
  { bg: string; text: string }
> = {
  payment: { bg: "rgba(16,185,129,0.12)", text: "#047857" },
  assignment: { bg: "rgba(59,130,246,0.12)", text: "#1d4ed8" },
  status: { bg: "rgba(148,163,184,0.16)", text: "#475569" },
  trip: { bg: "rgba(148,163,184,0.16)", text: "#475569" },
};

export type TripAuditLogContentProps = {
  title?: string;
  subtitle?: string;
  entries: TripAuditLogEntry[];
  matchesTab: (entry: TripAuditLogEntry, tabId: TripAuditFilterTab) => boolean;
  loading?: boolean;
  onClose: () => void;
  shellStyle?: ViewStyle;
};

function AuditLogEntryRow({
  entry,
  isLast,
}: {
  entry: TripAuditLogEntry;
  isLast: boolean;
}) {
  const tone = CATEGORY_TONE[entry.category];

  return (
    <View style={styles.entryRow}>
      <View style={styles.trackCol}>
        <View style={styles.trackDot} />
        {!isLast ? <View style={styles.trackLine} /> : null}
      </View>
      <View style={styles.entryCard}>
        <View style={styles.entryHead}>
          <View style={[styles.categoryChip, { backgroundColor: tone.bg }]}>
            <Text style={[styles.categoryChipText, { color: tone.text }]}>
              {entry.categoryLabel}
            </Text>
          </View>
          {entry.amountLabel ? (
            <Text
              style={[
                styles.amountLabel,
                entry.amountLabel.startsWith("+")
                  ? styles.amountIn
                  : styles.amountOut,
              ]}
            >
              {entry.amountLabel}
            </Text>
          ) : null}
        </View>

        <Text style={styles.entryTitle}>{entry.title}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{entry.recordedAtLabel}</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.metaText}>By {entry.recordedBy}</Text>
        </View>

        <View style={styles.detailBox}>
          <Text style={styles.detailPrimary} numberOfLines={3}>
            {entry.detail}
          </Text>
          {entry.detailLines?.map((line) => (
            <Text key={line} style={styles.detailSecondary} numberOfLines={2}>
              {line}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

export function TripAuditLogContent({
  title = "Audit log",
  subtitle,
  entries,
  matchesTab,
  loading = false,
  onClose,
  shellStyle,
}: TripAuditLogContentProps) {
  const [filterTab, setFilterTab] = useState<TripAuditFilterTab>("all");

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesTab(entry, filterTab)),
    [entries, filterTab, matchesTab],
  );

  return (
    <View style={[styles.shell, shellStyle]}>
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close audit log"
          hitSlop={8}
        >
          <X size={16} color={Theme.textMuted} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          {TABS.map((tab) => {
            const selected = filterTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setFilterTab(tab.id)}
                style={styles.tabItem}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.tabText, selected && styles.tabTextActive]}>
                  {tab.label}
                </Text>
                {selected ? <View style={styles.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {loading && entries.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.loadingText}>Loading audit log…</Text>
          </View>
        ) : null}

        {filteredEntries.length > 0 ? (
          <View style={styles.timeline}>
            {filteredEntries.map((entry, index) => (
              <AuditLogEntryRow
                key={entry.id}
                entry={entry}
                isLast={index === filteredEntries.length - 1}
              />
            ))}
          </View>
        ) : !loading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No audit entries</Text>
            <Text style={styles.emptyBody}>
              Trip status changes, assignments, and payments will appear here
              with date, actor, and details.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingHorizontal: 8,
  },
  tabScrollContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  tabItem: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    minWidth: 52,
    alignItems: "center",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tabTextActive: {
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.textPrimaryDark,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 20,
  },
  timeline: {
    gap: 0,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  trackCol: {
    width: 14,
    alignItems: "center",
  },
  trackDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 14,
    backgroundColor: Theme.borderLight,
    borderWidth: 1,
    borderColor: Theme.textMuted,
  },
  trackLine: {
    flex: 1,
    width: 1,
    marginTop: 4,
    marginBottom: -4,
    backgroundColor: Theme.borderLight,
  },
  entryCard: {
    flex: 1,
    minWidth: 0,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 4px rgba(15, 23, 42, 0.04)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  entryHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  categoryChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryChipText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  amountIn: {
    color: Theme.positive,
  },
  amountOut: {
    color: Theme.teslaRed,
  },
  entryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 5,
  },
  metaText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  metaDivider: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  detailBox: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  detailPrimary: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  detailSecondary: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  emptyBody: {
    marginTop: 4,
    fontSize: 12,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 17,
  },
});
