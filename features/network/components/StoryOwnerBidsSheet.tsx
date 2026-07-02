/**
 * Owner story footer — live bids from Pulse story vs Load center (network load page).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { StoryOwnerBidRow } from "@/features/network/utils/storyOwnerBids.util";
import { storyOwnerBidsLabel } from "@/features/network/utils/storyOwnerBids.util";
import { formatINR } from "@/lib/format";
import Feather from "@expo/vector-icons/Feather";
import { Gavel, Truck, X, Zap } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;
const SKY = Theme.loadAddButtonBg;

type Filter = "all" | "pulse_story" | "load_center";

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusTone(status: string): { bg: string; text: string; label: string } {
  if (status === "accepted") {
    return {
      bg: Theme.positiveMuted,
      text: Theme.positive,
      label: "Awarded",
    };
  }
  if (status === "rejected" || status === "withdrawn") {
    return {
      bg: Theme.surfaceGray,
      text: Theme.textMuted,
      label: status === "withdrawn" ? "Withdrawn" : "Rejected",
    };
  }
  return {
    bg: SKY,
    text: INK,
    label: "Pending",
  };
}

function ChannelIcon({ channel }: { channel: StoryOwnerBidRow["channel"] }) {
  if (channel === "pulse_story") {
    return <Zap size={11} color={INK} strokeWidth={2.25} />;
  }
  return <Truck size={11} color={INK} strokeWidth={2.25} />;
}

function BidRowCard({ row }: { row: StoryOwnerBidRow }) {
  const tone = statusTone(row.status);

  return (
    <View style={styles.bidCard}>
      <PartyAvatar
        name={row.bidderName}
        avatarSeed={row.bidderOrgId}
        size={40}
      />
      <View style={styles.bidMain}>
        <View style={styles.bidTopRow}>
          <Text style={styles.bidderName} numberOfLines={1}>
            {row.bidderName}
          </Text>
          <Text style={styles.bidAmount}>{formatINR(row.amount)}</Text>
        </View>
        <View style={styles.bidMetaRow}>
          <View style={styles.channelPill}>
            <ChannelIcon channel={row.channel} />
            <Text style={styles.channelText}>{row.channelLabel}</Text>
          </View>
          <Text style={styles.bidIdText}>{row.identifier}</Text>
          <Text style={styles.bidTime}>{timeAgo(row.createdAt)}</Text>
        </View>
        {row.note?.trim() ? (
          <Text style={styles.bidNote} numberOfLines={2}>
            {row.note.trim()}
          </Text>
        ) : null}
      </View>
      <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.statusText, { color: tone.text }]}>{tone.label}</Text>
      </View>
    </View>
  );
}

export type StoryOwnerBidsSheetProps = {
  visible: boolean;
  bids: StoryOwnerBidRow[];
  loading: boolean;
  indentId: string | null;
  indentLabel?: string | null;
  onClose: () => void;
  onOpenReviewHub?: () => void;
};

export function StoryOwnerBidsSheet({
  visible,
  bids,
  loading,
  indentId,
  indentLabel,
  onClose,
  onOpenReviewHub,
}: StoryOwnerBidsSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return bids;
    return bids.filter((b) => b.channel === filter);
  }, [bids, filter]);

  const storyCount = bids.filter((b) => b.channel === "pulse_story").length;
  const loadCount = bids.filter((b) => b.channel === "load_center").length;
  const listMaxHeight = Math.min(Math.max(filtered.length, 1) * 92 + 12, windowHeight * 0.42);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close bids" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeading}>
              <View style={styles.headerIcon}>
                <Gavel size={15} color={INK} strokeWidth={2.25} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{storyOwnerBidsLabel(bids.length, loading)}</Text>
                {indentLabel ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {indentLabel}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={16} color={MUTED} strokeWidth={2.25} />
            </Pressable>
          </View>

          <View style={styles.filterRow}>
            {(
              [
                { id: "all" as const, label: `All (${bids.length})` },
                { id: "pulse_story" as const, label: `Story (${storyCount})` },
                { id: "load_center" as const, label: `Load (${loadCount})` },
              ] as const
            ).map((chip) => {
              const active = filter === chip.id;
              return (
                <Pressable
                  key={chip.id}
                  onPress={() => setFilter(chip.id)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={INK} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>Waiting for partners</Text>
              <Text style={styles.emptyBody}>
                Bids from your Pulse story show as STORY·… IDs. Quotes from the Load
                center / network page show as LOAD·… IDs.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.map((row) => (
                <BidRowCard key={row.key} row={row} />
              ))}
            </ScrollView>
          )}

          {indentId && onOpenReviewHub ? (
            <Pressable
              style={({ pressed }) => [styles.reviewBtn, pressed && styles.reviewBtnPressed]}
              onPress={() => {
                onClose();
                onOpenReviewHub();
              }}
              accessibilityRole="button"
              accessibilityLabel="Open indent review hub"
            >
              <Text style={styles.reviewBtnText}>Open review hub</Text>
              <Feather name="arrow-up-right" size={14} color={Theme.buttonPrimaryText} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Theme.overlayBackdrop,
  },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    maxHeight: "88%",
    ...Platform.select({
      web: { boxShadow: "0 -8px 32px rgba(15,23,42,0.12)" } as object,
      default: {},
    }),
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  headerLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: SKY,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceLight,
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  filterChipActive: {
    backgroundColor: SKY,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.15,
  },
  filterChipTextActive: {
    color: INK,
  },
  loadingWrap: {
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyWrap: {
    paddingVertical: 18,
    paddingHorizontal: 8,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: INK,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 16,
    textAlign: "center",
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  bidCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  bidMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  bidTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bidderName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  bidAmount: {
    fontSize: 12,
    fontWeight: "800",
    color: INK,
    fontVariant: ["tabular-nums"],
  },
  bidMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  channelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  channelText: {
    fontSize: 8,
    fontWeight: "800",
    color: INK,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  bidIdText: {
    fontSize: 8,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.35,
    fontVariant: ["tabular-nums"],
  },
  bidTime: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  bidNote: {
    fontSize: 10,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 14,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  reviewBtn: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  reviewBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  reviewBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
