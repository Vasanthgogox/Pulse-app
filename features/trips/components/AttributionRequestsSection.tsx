import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useDriverProfileImagesQuery } from "@/lib/queries/useDriverProfileImagesQuery";

const GRID_COLUMNS = 2;
const GRID_GAP = 8;
const LIST_MAX_HEIGHT = 248;
const SCROLL_HINT_THRESHOLD = 3;
const CARD_AVATAR_SIZE = 30;
const CARD_MIN_HEIGHT = 108;

function chunkRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export type AttributionRequestsSectionProps = {
  requests: SalaryRequestWithDriverRow[];
  orgId: string | null;
  busySalaryId: string | null;
  onAccept: (req: SalaryRequestWithDriverRow) => void;
  onReject: (requestId: string) => void;
};

function formatRequestDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function pendingCountLabel(count: number): string {
  return count === 1 ? "1 pending" : `${count} pending`;
}

type AttributionRequestCardProps = {
  req: SalaryRequestWithDriverRow;
  avatarUrl?: string | null;
  busy: boolean;
  onAccept: (req: SalaryRequestWithDriverRow) => void;
  onReject: (requestId: string) => void;
};

const AttributionRequestCard = memo(function AttributionRequestCard({
  req,
  avatarUrl,
  busy,
  onAccept,
  onReject,
}: AttributionRequestCardProps) {
  const driverName = req.drivers?.name?.trim() || "Driver";
  const amount = Number(req.amount ?? 0);

  return (
    <View style={styles.gridCell}>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <PartyAvatar
            name={driverName}
            avatarUrl={avatarUrl ?? null}
            avatarSeed={req.driver_id}
            entityType="driver"
            size={CARD_AVATAR_SIZE}
            shape="rounded"
          />
          <View style={styles.cardBody}>
            <View style={styles.nameAmountRow}>
              <Text style={styles.driverName} numberOfLines={1}>
                {driverName}
              </Text>
              <Text style={styles.amount} numberOfLines={1}>
                ₹{amount.toLocaleString("en-IN")}
              </Text>
            </View>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {formatRequestDate(req.created_at)} · Review
            </Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={() => onReject(req.id)}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Reject attribution request from ${driverName}`}
          >
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.acceptBtn, busy && styles.acceptBtnDisabled]}
            onPress={() => onAccept(req)}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Accept attribution request from ${driverName}`}
          >
            {busy ? (
              <ActivityIndicator size="small" color={Theme.textOnDark} />
            ) : (
              <Text style={styles.acceptBtnText}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

function RequestGrid({
  requests,
  driverAvatarById,
  busySalaryId,
  onAccept,
  onReject,
}: {
  requests: SalaryRequestWithDriverRow[];
  driverAvatarById: Record<string, string | null | undefined>;
  busySalaryId: string | null;
  onAccept: (req: SalaryRequestWithDriverRow) => void;
  onReject: (requestId: string) => void;
}) {
  const requestRows = useMemo(
    () => chunkRows(requests, GRID_COLUMNS),
    [requests],
  );

  return (
    <View style={styles.grid}>
      {requestRows.map((row, rowIndex) => (
        <View key={`attr-req-row-${rowIndex}`} style={styles.gridRow}>
          {row.map((req) => (
            <AttributionRequestCard
              key={req.id}
              req={req}
              avatarUrl={driverAvatarById[req.driver_id] ?? null}
              busy={busySalaryId === req.id}
              onAccept={onAccept}
              onReject={onReject}
            />
          ))}
          {row.length < GRID_COLUMNS
            ? Array.from({ length: GRID_COLUMNS - row.length }).map((_, i) => (
                <View
                  key={`attr-req-pad-${rowIndex}-${i}`}
                  style={styles.gridCell}
                  pointerEvents="none"
                />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

export const AttributionRequestsSection = memo(function AttributionRequestsSection({
  requests,
  orgId,
  busySalaryId,
  onAccept,
  onReject,
}: AttributionRequestsSectionProps) {
  const salaryRequestsHasMore = useGlobalSyncStore((s) => s.salaryRequestsHasMore);
  const loadMoreSalaryRequests = useGlobalSyncStore((s) => s.loadMoreSalaryRequests);
  const [loadingMore, setLoadingMore] = useState(false);

  const driverIds = useMemo(
    () => [...new Set(requests.map((r) => r.driver_id).filter(Boolean))],
    [requests],
  );
  const driverAvatarById = useDriverProfileImagesQuery(driverIds);

  const showScrollHint = requests.length > SCROLL_HINT_THRESHOLD;
  const showLoadMore = salaryRequestsHasMore && Boolean(orgId);
  const useBoundedScroll = showScrollHint || showLoadMore;

  const handleLoadMore = useCallback(async () => {
    if (!orgId || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadMoreSalaryRequests(orgId);
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, loadingMore, loadMoreSalaryRequests]);

  if (!requests.length) return null;

  const grid = (
    <RequestGrid
      requests={requests}
      driverAvatarById={driverAvatarById}
      busySalaryId={busySalaryId}
      onAccept={onAccept}
      onReject={onReject}
    />
  );

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Attribution requests</Text>
        <View style={styles.countBadge} accessibilityLabel={pendingCountLabel(requests.length)}>
          <Text style={styles.countBadgeText}>{pendingCountLabel(requests.length)}</Text>
        </View>
      </View>
      <Text style={styles.sectionSubtitle}>
        Review and accept driver trip attribution requests from fleet home.
      </Text>

      {useBoundedScroll ? (
        <ScrollView
          style={[styles.listScroll, styles.listScrollBounded]}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {grid}
          {showLoadMore ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => void handleLoadMore()}
              disabled={loadingMore}
              activeOpacity={0.85}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={Theme.primary} />
              ) : (
                <Text style={styles.loadMoreBtnText}>Load more requests</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.listContent}>{grid}</View>
      )}

      {showScrollHint ? (
        <Text style={styles.scrollHint}>Scroll for more requests</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    gap: 8,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
  },
  sectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.pulseIndigoWash,
    flexShrink: 0,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 16,
    width: "100%",
  },
  listScroll: {
    alignSelf: "stretch",
    width: "100%",
    flexGrow: 0,
  },
  listScrollBounded: {
    maxHeight: LIST_MAX_HEIGHT,
  },
  listContent: {
    width: "100%",
    alignSelf: "stretch",
    gap: GRID_GAP,
    ...Platform.select({
      web: { minWidth: 0 },
    }),
  },
  grid: {
    width: "100%",
    alignSelf: "stretch",
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: GRID_GAP,
    width: "100%",
    alignSelf: "stretch",
  },
  gridCell: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignSelf: "stretch",
  },
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: CARD_MIN_HEIGHT,
    alignSelf: "stretch",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 8,
    justifyContent: "space-between",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    width: "100%",
    minWidth: 0,
  },
  driverName: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    color: Theme.textPrimaryDark,
  },
  amount: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  cardMeta: {
    fontSize: 10,
    lineHeight: 13,
    color: Theme.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    width: "100%",
    marginTop: 2,
  },
  rejectBtn: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  acceptBtn: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.darkBackground,
    backgroundColor: Theme.darkBackground,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtnDisabled: {
    opacity: 0.7,
  },
  acceptBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  loadMoreBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minHeight: 36,
    width: "100%",
  },
  loadMoreBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
  },
  scrollHint: {
    fontSize: 10,
    color: Theme.textMuted,
    textAlign: "center",
    width: "100%",
  },
});
