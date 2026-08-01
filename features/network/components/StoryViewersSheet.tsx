/**
 * "Seen by" bottom sheet for story broadcasts — full-width, compact rows.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  StoryFlowSheetPortal,
  useStoryPhoneFrameMetrics,
} from "@/features/network/components/StoryMobilePopupShell";
import type { StoryViewRow } from "@/features/network/services/story-views.service";
import { Eye, X } from "lucide-react-native";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;
const SKY = Theme.loadAddButtonBg;

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function viewersTitle(count: number, loading: boolean): string {
  if (loading) return "Loading…";
  if (count === 0) return "No views yet";
  if (count === 1) return "1 viewed";
  return `${count} viewed`;
}

export type StoryViewersSheetProps = {
  visible: boolean;
  views: StoryViewRow[];
  loading: boolean;
  onClose: () => void;
};

export function StoryViewersSheet({
  visible,
  views,
  loading,
  onClose,
}: StoryViewersSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { phonePopup, sheetBottomPad } = useStoryPhoneFrameMetrics();
  const listMaxHeight = Math.min(views.length * 48 + 6, windowHeight * 0.32);
  const bottomPad = sheetBottomPad ?? insets.bottom + 14;

  return (
    <StoryFlowSheetPortal
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Close viewers"
    >
      <View style={[styles.sheet, phonePopup && styles.sheetPhone, { paddingBottom: bottomPad }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeading}>
              <View style={styles.headerIcon}>
                <Eye size={12} color={INK} strokeWidth={2.25} />
              </View>
              <Text style={styles.title}>{viewersTitle(views.length, loading)}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={13} color={INK} strokeWidth={2.25} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={INK} />
            </View>
          ) : views.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Eye size={18} color={MUTED} strokeWidth={1.75} />
              </View>
              <Text style={styles.emptyText}>No one has viewed this yet</Text>
              <Text style={styles.emptyHint}>Viewers from your network will appear here</Text>
            </View>
          ) : (
            <ScrollView
              style={[styles.list, { maxHeight: listMaxHeight }]}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={views.length > 4}
              bounces={views.length > 4}
            >
              {views.map((item) => (
                <View key={item.id} style={styles.viewerCard}>
                  <PartyAvatar
                    name={item.viewer_org_name?.trim() || "Partner"}
                    initialsColorSeed={item.viewer_org_id}
                    entityType="client"
                    size={32}
                    shape="circle"
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.orgName} numberOfLines={1}>
                      {item.viewer_org_name?.trim() || "Partner"}
                    </Text>
                    <Text style={styles.viewedAt}>{timeAgo(item.viewed_at)}</Text>
                  </View>
                  <View style={styles.seenMark}>
                    <Eye size={11} color={INK} strokeWidth={2} />
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
      </View>
    </StoryFlowSheetPortal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: Theme.loadStatusTabTrayBorder,
    ...Platform.select({
      web: { boxShadow: "0 -8px 32px rgba(77, 54, 54, 0.14)" } as object,
      ios: {
        shadowColor: "#4D3636",
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  sheetPhone: {
    maxHeight: "88%",
  },
  handle: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: Theme.loadStatusTabBorderSoft,
    alignSelf: "center",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
    gap: 10,
  },
  headerLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: SKY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: 13.5,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  closeBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  loadingWrap: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 6,
    paddingBottom: 2,
  },
  viewerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 11,
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  orgName: {
    fontSize: 12.5,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.2,
  },
  viewedAt: {
    fontSize: 10,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.05,
  },
  seenMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: SKY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 14,
    gap: 4,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.loadStatusTabTrayBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emptyText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.2,
  },
  emptyHint: {
    fontSize: 10,
    color: MUTED,
    textAlign: "center",
    lineHeight: 14,
  },
});
