import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

const LIST_MAX_HEIGHT = 288;
const SCROLL_HINT_THRESHOLD = 2;

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
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <PartyAvatar
          name={driverName}
          avatarUrl={avatarUrl ?? null}
          avatarSeed={req.driver_id}
          entityType="driver"
          size={44}
          shape="rounded"
        />
        <View style={styles.cardBody}>
          <Text style={styles.driverName} numberOfLines={1}>
            {driverName}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {formatRequestDate(req.created_at)} · Trip review request
          </Text>
        </View>
        <Text style={styles.amount}>₹{amount.toLocaleString("en-IN")}</Text>
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
  );
});

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

      <ScrollView
        style={[styles.listScroll, showScrollHint && styles.listScrollBounded]}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={showScrollHint}
        keyboardShouldPersistTaps="handled"
      >
        {requests.map((req) => (
          <AttributionRequestCard
            key={req.id}
            req={req}
            avatarUrl={driverAvatarById[req.driver_id] ?? null}
            busy={busySalaryId === req.id}
            onAccept={onAccept}
            onReject={onReject}
          />
        ))}

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
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
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
    paddingHorizontal: 12,
  },
  listScroll: {
    flexGrow: 0,
    width: "100%",
  },
  listScrollBounded: {
    maxHeight: LIST_MAX_HEIGHT,
  },
  listContent: {
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 10,
    width: "100%",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  driverName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  amount: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    flexShrink: 0,
    textAlign: "right",
    minWidth: 56,
  },
  cardMeta: {
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  rejectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    minWidth: 76,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  acceptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.darkBackground,
    backgroundColor: Theme.darkBackground,
    minWidth: 84,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtnDisabled: {
    opacity: 0.7,
  },
  acceptBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  loadMoreBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    minHeight: 40,
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
    paddingHorizontal: 12,
  },
});
