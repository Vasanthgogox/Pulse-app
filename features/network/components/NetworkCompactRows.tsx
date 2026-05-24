/**
 * Compact user cards + pagination for Network tab (connections & discover).
 */
import { EntityAvatar as PartyAvatar } from '@/components/EntityAvatar';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import { ConnectionEntityAvatar } from "@/features/network/utils/connectionEntityAvatar";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import { ChevronRight, Clock3, UserPlus, X, Zap } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const NETWORK_LIST_PAGE_SIZE = 20;

export const networkCompactListStyle = {
  width: "100%" as const,
  paddingTop: 2,
  paddingHorizontal: Layout.screenPaddingHorizontal,
  gap: 6,
};

export function useNetworkListPagination<T>(
  items: T[],
  resetKey: string,
  pageSize = NETWORK_LIST_PAGE_SIZE,
) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [resetKey, pageSize]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = items.length > visibleCount;
  const remaining = items.length - visibleCount;

  return {
    visibleItems,
    hasMore,
    remaining,
    loadMore: () => setVisibleCount((n) => n + pageSize),
    total: items.length,
  };
}

export function NetworkLoadMoreButton({
  onPress,
  remaining,
}: {
  onPress: () => void;
  remaining: number;
}) {
  const label =
    remaining > NETWORK_LIST_PAGE_SIZE
      ? `Load more (${NETWORK_LIST_PAGE_SIZE} more)`
      : `Load more (${remaining})`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.loadMoreBtnPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.loadMoreText}>{label}</Text>
    </Pressable>
  );
}

function roleTone(role: ConnectedOrg["role"]) {
  if (role === "CLIENT")
    return { bg: Theme.networkClientTintBg, text: Theme.primary };
  if (role === "DRIVER")
    return { bg: Theme.networkDriverTintBg, text: Theme.warning };
  return { bg: Theme.networkSupplierTintBg, text: Theme.positive };
}

export function ConnectionCompactRow({
  item,
  onPress,
}: {
  item: ConnectedOrg;
  onPress?: () => void;
}) {
  const tone = roleTone(item.role);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.role}`}
    >
      <View style={styles.cardRow}>
        <View style={styles.avatar}>
          <ConnectionEntityAvatar item={item} size={42} />
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.rowMeta}>
            <View style={[styles.rolePill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.rolePillText, { color: tone.text }]}>{item.role}</Text>
            </View>
            {item.is_integrated ? (
              <Text style={styles.liveLabel}>On Pulse</Text>
            ) : null}
          </View>
        </View>
        <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

export function DiscoverCompactRow({
  org,
  location,
  statusLabel,
  onPress,
  onConnect,
  onCancel,
  loading,
}: {
  org: DiscoverOrg;
  location?: string | null;
  statusLabel: "live" | "pending" | "connected" | "none";
  onPress?: () => void;
  onConnect?: () => void;
  onCancel?: () => void;
  loading?: boolean;
}) {
  const isPending = statusLabel === "pending";
  const isConnected = statusLabel === "connected";

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.rowTap, pressed && styles.cardPressed]}
          accessibilityRole="button"
          accessibilityLabel={org.name}
        >
          <PartyAvatar
            name={org.name}
            initialsColorSeed={org.id}
            avatarSeed={org.avatar_seed}
            entityType="client"
            size={42}
            style={styles.discoverAvatarRound}
            borderStyle={styles.discoverAvatarPlain}
          />
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {org.name}
            </Text>
            {location ? (
              <Text style={styles.rowSub} numberOfLines={1}>
                {location}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View style={styles.rowActions}>
          {isConnected ? (
            <Text style={styles.statusText}>Connected</Text>
          ) : isPending ? (
            <>
              <View style={styles.pendingPill}>
                <Clock3 size={11} color={Theme.warning} strokeWidth={2.2} />
                <Text style={styles.pendingText}>Sent</Text>
              </View>
              <Pressable
                onPress={onCancel}
                disabled={loading}
                style={({ pressed }) => [styles.iconAction, pressed && styles.cardPressed]}
                hitSlop={8}
                accessibilityLabel={`Cancel request to ${org.name}`}
              >
                {loading ? (
                  <LoadingIndicator size={12} color={Theme.textPrimaryDark} />
                ) : (
                  <X size={14} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={onConnect}
              disabled={loading}
              style={({ pressed }) => [
                styles.connectBtn,
                pressed && styles.cardPressed,
                loading && styles.connectBtnLoading,
              ]}
              accessibilityLabel={`Send request to ${org.name}`}
            >
              {loading ? (
                <LoadingIndicator size={12} color={Theme.textOnPrimary} />
              ) : (
                <>
                  <UserPlus size={13} color={Theme.textOnPrimary} strokeWidth={2.4} />
                  <Text style={styles.connectBtnText}>Connect</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 11,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  rowTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  rowSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  liveDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rolePillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  liveLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.positive,
    letterSpacing: 0.3,
  },
  discoverAvatarRound: {
    borderRadius: 21,
    overflow: "hidden",
  },
  discoverAvatarPlain: {
    borderWidth: 0,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.warning,
  },
  iconAction: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    minWidth: 88,
    justifyContent: "center",
  },
  connectBtnLoading: {
    opacity: 0.85,
  },
  connectBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  loadMoreBtn: {
    marginTop: 2,
    marginBottom: 2,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surface,
  },
  loadMoreBtnPressed: {
    opacity: 0.9,
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
});
