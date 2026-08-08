/**
 * Full-page modal listing all indent cards for a Load Center kanban column.
 * Full-bleed width; cards lay out 4 / 2 / 1 across (desktop / tablet / phone).
 * Uses the same grid card renderer as the board (dense + fillGrid).
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { HUB_GRID_MIN_WIDTH } from "@/components/hub/hubGridCardLayout";
import type { IndentRow } from "@/features/indents";
import type {
  LoadCenterKanbanColumn,
} from "@/features/network/components/LoadCenterKanbanBoard";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TABLET_BREAKPOINT = 720;
const DESKTOP_SIDE_PAD = 20;
const MOBILE_SIDE_PAD = Layout.screenPaddingHorizontal;
const GRID_GAP = 12;

export type LoadCenterKanbanColumnModalProps = {
  visible: boolean;
  column: LoadCenterKanbanColumn | null;
  onClose: () => void;
  renderCard: (load: IndentRow) => ReactNode;
  highlightedIndentId?: string | null;
};

function columnCountForWidth(width: number): 1 | 2 | 4 {
  if (width >= HUB_GRID_MIN_WIDTH) return 4;
  if (width >= TABLET_BREAKPOINT) return 2;
  return 1;
}

export function LoadCenterKanbanColumnModal({
  visible,
  column,
  onClose,
  renderCard,
  highlightedIndentId = null,
}: LoadCenterKanbanColumnModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= TABLET_BREAKPOINT;
  const sidePad = isDesktop ? DESKTOP_SIDE_PAD : MOBILE_SIDE_PAD;
  const columns = columnCountForWidth(width);

  const cellStyle = useMemo(() => {
    if (columns === 1) {
      return styles.cardCellOne;
    }
    const pct = columns === 4 ? "25%" : "50%";
    return {
      width: pct as `${number}%`,
      maxWidth: pct as `${number}%`,
      flexBasis: pct as `${number}%`,
      paddingHorizontal: GRID_GAP / 2,
      marginBottom: GRID_GAP,
      alignSelf: "stretch" as const,
      minWidth: 0,
    };
  }, [columns]);

  const tabs = column?.tabs ?? [];
  const hasTabs = tabs.length > 0;
  const [activeTabId, setActiveTabId] = useState(
    column?.defaultTabId ?? tabs[0]?.id ?? "",
  );

  useEffect(() => {
    if (!column) return;
    setActiveTabId(column.defaultTabId ?? column.tabs?.[0]?.id ?? "");
  }, [column]);

  if (!column) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;
  const visibleLoads = hasTabs ? (activeTab?.loads ?? []) : column.loads;
  const badgeCount = column.loads.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: Math.max(insets.top, isDesktop ? 12 : 12),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={[styles.headerBand, { paddingHorizontal: sidePad }]}>
          <View style={styles.headerInner}>
            <View style={styles.headerLeft}>
              <View
                style={[styles.accent, { backgroundColor: column.accent }]}
              />
              <View style={styles.headerText}>
                <Text
                  style={[styles.title, isDesktop && styles.titleDesktop]}
                  numberOfLines={1}
                >
                  {column.label}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {badgeCount} load{badgeCount === 1 ? "" : "s"} in this stage
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{badgeCount}</Text>
              </View>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && styles.closeBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <FontAwesome
                  name="times"
                  size={16}
                  color={Theme.textPrimaryDark}
                />
              </Pressable>
            </View>
          </View>
        </View>

        {hasTabs ? (
          <View style={[styles.subTabBand, { paddingHorizontal: sidePad }]}>
            <View style={styles.subTabRow}>
              {tabs.map((tab) => {
                const on = tab.id === (activeTab?.id ?? "");
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => setActiveTabId(tab.id)}
                    style={[styles.subTab, on && styles.subTabOn]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    <Text
                      style={[styles.subTabText, on && styles.subTabTextOn]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                    <View
                      style={[styles.subTabCount, on && styles.subTabCountOn]}
                    >
                      <Text
                        style={[
                          styles.subTabCountText,
                          on && styles.subTabCountTextOn,
                        ]}
                      >
                        {tab.loads.length}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: sidePad - (columns > 1 ? GRID_GAP / 2 : 0),
              paddingTop: isDesktop ? 16 : 14,
              paddingBottom: isDesktop ? 32 : 28,
            },
          ]}
          showsVerticalScrollIndicator
        >
          {visibleLoads.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <FontAwesome name="inbox" size={16} color={Theme.textMuted} />
              </View>
              <Text style={styles.emptyText}>No loads in this stage</Text>
            </View>
          ) : (
            <View
              style={[
                styles.grid,
                columns === 1 && styles.gridStack,
              ]}
            >
              {visibleLoads.map((load) => (
                <View
                  key={load.id}
                  style={[
                    cellStyle,
                    highlightedIndentId === load.id && styles.cardHighlighted,
                  ]}
                >
                  <View style={styles.cardFill}>{renderCard(load)}</View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.surfaceGray,
    width: "100%",
  },
  headerBand: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 14,
    width: "100%",
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  accent: {
    width: 4,
    height: 32,
    borderRadius: 2,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  titleDesktop: {
    fontSize: 20,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  countBadge: {
    minWidth: 28,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  subTabBand: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingTop: 12,
    paddingBottom: 12,
    width: "100%",
  },
  subTabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  subTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  subTabOn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary,
    flexShrink: 1,
  },
  subTabTextOn: {
    color: Theme.textOnDark,
  },
  subTabCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  subTabCountOn: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  subTabCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  subTabCountTextOn: {
    color: Theme.textOnDark,
  },
  scroll: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    ...Platform.select({
      web: { boxSizing: "border-box" } as object,
      default: {},
    }),
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    width: "100%",
  },
  gridStack: {
    flexDirection: "column",
  },
  cardCellOne: {
    width: "100%",
    alignSelf: "stretch",
    marginBottom: GRID_GAP,
    minWidth: 0,
  },
  cardFill: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: Theme.primary,
    borderRadius: 14,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 80,
    width: "100%",
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});
