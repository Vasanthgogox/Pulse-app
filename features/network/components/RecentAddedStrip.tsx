/**
 * Recently added — avatars, role, status, and connect / on Pulse (matches network hub semantics).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import { runConnectionInvite } from "@/features/network/utils/connectionInvite.util";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { UserPlus2, Zap } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const MAX_RECENT = 5;

const ROLE_LABEL: Record<ConnectedOrg["role"], string> = {
  CLIENT: "Client",
  SUPPLIER: "Supplier",
  DRIVER: "Driver",
};

function entityTypeForRole(role: ConnectedOrg["role"]): PartyEntityType {
  if (role === "DRIVER") return "driver";
  if (role === "SUPPLIER") return "supplier";
  return "client";
}

function statusSubline(item: ConnectedOrg): string {
  if (item.is_integrated) {
    return "on Pulse · operational access";
  }
  if (!item.phone?.trim()) {
    return "Phone required to invite";
  }
  return "Not on app yet — connect to request or share";
}

type Props = {
  orgId: string;
  items: ConnectedOrg[];
  onAfterInAppSuccess?: () => void | Promise<void>;
  layout?: "full" | "split";
};

export function RecentAddedStrip({ orgId, items, onAfterInAppSuccess, layout = "full" }: Props) {
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const entranceY = useRef(new Animated.Value(6)).current;
  const itemsKey = items.map((i) => i.id).join("|");

  useEffect(() => {
    if (items.length === 0) {
      entranceOpacity.setValue(0);
      entranceY.setValue(6);
      return;
    }
    if (layout === "split") {
      entranceY.setValue(0);
      entranceOpacity.setValue(0);
      const fade = Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      });
      fade.start();
      return () => fade.stop();
    }
    entranceOpacity.setValue(0);
    entranceY.setValue(8);
    const enter = Animated.parallel([
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.spring(entranceY, {
        toValue: 0,
        friction: 9,
        tension: 68,
        useNativeDriver: true,
      }),
    ]);
    enter.start();
    return () => {
      enter.stop();
    };
  }, [itemsKey, items.length, layout, entranceOpacity, entranceY]);

  if (items.length === 0) return null;

  const shown = items.slice(0, MAX_RECENT);
  const isSplit = layout === "split";
  const avatarSize = isSplit ? 44 : 42;

  const onInvite = async (item: ConnectedOrg) => {
    if (item.is_integrated) return;
    if (!item.phone?.trim()) return;
    setInvitingId(item.id);
    try {
      await runConnectionInvite(orgId, item, onAfterInAppSuccess);
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <View style={isSplit ? styles.hubBarSplit : styles.hubBar}>
      <Animated.View
        style={[
          isSplit ? styles.hubTopRowSplit : styles.hubTopRow,
          isSplit
            ? { opacity: entranceOpacity }
            : { opacity: entranceOpacity, transform: [{ translateY: entranceY }] },
        ]}
      >
        <View style={[styles.card, isSplit && styles.cardSplit]}>
          <View style={[styles.headerRow, isSplit && styles.headerRowSplit]}>
            <View style={styles.iconRing}>
              <UserPlus2 size={12} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <Text style={styles.kicker}>Recently added</Text>
          </View>

          <View style={styles.itemList}>
            {shown.map((item, index) => {
              const et = entityTypeForRole(item.role);
              const canAct = !item.is_integrated && Boolean(item.phone?.trim());
              const busy = invitingId === item.id;
              const canPress = canAct && !busy;
              const rating =
                typeof item.rating === "number" && Number.isFinite(item.rating)
                  ? item.rating.toFixed(1)
                  : null;
              const isLast = index === shown.length - 1;
              return (
                <View
                  key={`${item.role}-${item.id}`}
                  style={[styles.itemRow, !isLast && styles.itemRowDivider]}
                >
                  <PartyAvatar
                    name={item.name}
                    avatarUrl={item.avatar_url}
                    avatarSeed={item.avatar_seed}
                    entityType={et}
                    size={avatarSize}
                    borderStyle={styles.avatarBorder}
                  />
                  <View style={styles.itemBody}>
                    <Text style={styles.itemName} numberOfLines={2} ellipsizeMode="tail">
                      {item.name}
                    </Text>
                    <View style={styles.metaRow}>
                      <View style={styles.rolePill}>
                        <Text style={styles.rolePillText}>{ROLE_LABEL[item.role]}</Text>
                      </View>
                      {rating ? (
                        <Text style={styles.ratingText}>· ★ {rating}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.subline} numberOfLines={2} ellipsizeMode="tail">
                      {statusSubline(item)}
                    </Text>
                  </View>
                  <View style={styles.itemAction}>
                    {item.is_integrated ? (
                      <View style={styles.onQPill} accessibilityLabel={`${item.name} on Pulse`}>
                        <Zap size={12} color={Theme.positive} fill={Theme.positive} />
                        <Text style={styles.onQPillText}>on Pulse</Text>
                      </View>
                    ) : !item.phone?.trim() ? (
                      <View style={styles.mutedPill}>
                        <Text style={styles.mutedPillText}>Add phone</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => void onInvite(item)}
                        disabled={!canPress}
                        accessibilityLabel={`Send app invite to ${item.name}`}
                        style={({ pressed }) => [
                          styles.connectBtn,
                          !canPress && styles.connectBtnDisabled,
                          pressed && canPress && styles.connectBtnPressed,
                        ]}
                        hitSlop={4}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={Theme.textOnDark} />
                        ) : (
                          <Text style={styles.connectBtnText}>Send invite</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  hubBar: {
    backgroundColor: Theme.networkPageBackground,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.networkCardBorder,
  },
  hubBarSplit: {
    width: "100%",
    minWidth: 0,
    flex: 1,
    alignSelf: "stretch",
  },
  hubTopRow: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  hubTopRowSplit: {
    paddingHorizontal: 0,
    flex: 1,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    backgroundColor: Theme.networkCardBackground,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 12,
  },
  cardSplit: {
    paddingBottom: 12,
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  headerRowSplit: {
    marginBottom: 8,
  },
  iconRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
    color: Theme.networkSectionLabel,
    textTransform: "uppercase",
  },
  itemList: {
    width: "100%",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    minHeight: 64,
  },
  itemRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.networkCardBorder,
  },
  avatarBorder: {
    borderColor: Theme.networkCardBorder,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
  },
  itemName: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: Theme.networkPageBackground,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
  },
  rolePillText: {
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
  },
  ratingText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.networkSectionLabel,
  },
  subline: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  itemAction: {
    flexShrink: 0,
    alignSelf: "center",
    minWidth: 86,
    alignItems: "flex-end",
  },
  onQPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positive,
  },
  onQPillText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.positive,
  },
  mutedPill: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
  },
  mutedPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.networkSectionLabel,
  },
  connectBtn: {
    minWidth: 86,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Theme.primary,
    borderWidth: 1,
    borderColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  connectBtnDisabled: { opacity: 0.4 },
  connectBtnPressed: { opacity: 0.88 },
  connectBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: 0.3,
  },
});
