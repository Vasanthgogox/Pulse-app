/**
 * Team members list: active members and pending invites.
 * Matches InvitationsView / ConnectionsView hub styling.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { PartyAvatar } from "@/components/PartyAvatar";
import { useOrgMembersQuery, useInvalidateOrgMembers } from "@/lib/queries/useOrgMembersQuery";
import {
  updateMemberRole,
  removeMember,
  cancelTeamInvite,
} from "@/features/organization/services/members.service";
import type { OrgMember, OrgMemberRole } from "@/types/organization";
import {
  Check,
  ChevronDown,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus2,
  Users,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleLabel(role: OrgMemberRole): string {
  switch (role) {
    case "owner": return "OWNER";
    case "admin": return "ADMIN";
    case "driver": return "DRIVER";
    default: return "MEMBER";
  }
}

function roleBadgeColor(role: OrgMemberRole): string {
  switch (role) {
    case "owner": return Theme.primary;
    case "admin": return Theme.darkGreen;
    default: return Theme.textSecondary;
  }
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  return `${Math.max(1, m)}m ago`;
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({
  member,
  isCurrentUser,
  canManage,
  onRoleChange,
  onRemove,
}: {
  member: OrgMember;
  isCurrentUser: boolean;
  canManage: boolean;
  onRoleChange: (member: OrgMember, role: OrgMemberRole) => void;
  onRemove: (member: OrgMember) => void;
}) {
  const displayName = member.full_name || member.phone || member.email || "Unknown";
  const isOwner = member.role === "owner";
  const isPending = member.status === "invited";

  const handleActions = () => {
    if (!canManage || isOwner || isCurrentUser) return;
    const options = [
      member.role === "admin" ? "Make Member" : "Make Admin",
      "Remove from team",
      "Cancel",
    ];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) {
            onRoleChange(member, member.role === "admin" ? "member" : "admin");
          } else if (idx === 1) {
            onRemove(member);
          }
        },
      );
    } else {
      Alert.alert(
        displayName,
        "Choose an action",
        [
          {
            text: member.role === "admin" ? "Make Member" : "Make Admin",
            onPress: () => onRoleChange(member, member.role === "admin" ? "member" : "admin"),
          },
          {
            text: "Remove from team",
            style: "destructive",
            onPress: () => onRemove(member),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    }
  };

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.cardCover}>
        <View style={cardStyles.coverOrbLarge} />
        <View style={cardStyles.coverOrbSmall} />
        <View style={cardStyles.badgeRow}>
          <View style={[cardStyles.rolePill, { borderColor: roleBadgeColor(member.role) }]}>
            <Shield size={9} color={roleBadgeColor(member.role)} strokeWidth={2.4} />
            <Text style={[cardStyles.rolePillText, { color: roleBadgeColor(member.role) }]}>
              {roleLabel(member.role)}
            </Text>
          </View>
          {isPending ? (
            <View style={cardStyles.pendingPill}>
              <Text style={cardStyles.pendingPillText}>PENDING</Text>
            </View>
          ) : (
            <View style={cardStyles.activePill}>
              <Check size={9} color={Theme.darkGreen} strokeWidth={2.8} />
              <Text style={cardStyles.activePillText}>ACTIVE</Text>
            </View>
          )}
          {isCurrentUser && (
            <View style={cardStyles.youPill}>
              <Text style={cardStyles.youPillText}>YOU</Text>
            </View>
          )}
        </View>
      </View>

      <View style={cardStyles.cardBody}>
        <View style={cardStyles.avatarWrap}>
          <PartyAvatar
            name={displayName.toUpperCase()}
            avatarUrl={member.avatar_url ?? null}
            entityType="client"
            size={58}
            borderStyle={cardStyles.avatarBorder}
          />
        </View>
        <Text style={cardStyles.name} numberOfLines={1}>
          {displayName.toUpperCase()}
        </Text>
        {!!member.phone && (
          <Text style={cardStyles.phone} numberOfLines={1}>
            {member.phone}
          </Text>
        )}
        <View style={cardStyles.metaRow}>
          <View style={cardStyles.metaChip}>
            <Text style={cardStyles.metaChipText}>
              {formatRelative(member.joined_at)}
            </Text>
          </View>
        </View>
      </View>

      {canManage && !isOwner && !isCurrentUser && (
        <Pressable
          onPress={handleActions}
          style={({ pressed }) => [cardStyles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <ChevronDown size={14} color={Theme.textSecondary} strokeWidth={2.2} />
        </Pressable>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.055,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
    overflow: "hidden",
  },
  cardCover: {
    height: 72,
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  coverOrbLarge: {
    position: "absolute",
    width: 120,
    height: 64,
    borderRadius: 60,
    top: -16,
    left: -24,
    backgroundColor: Theme.borderLight,
    transform: [{ rotate: "-10deg" }],
  },
  coverOrbSmall: {
    position: "absolute",
    width: 80,
    height: 48,
    borderRadius: 40,
    right: -18,
    bottom: -12,
    backgroundColor: Theme.surface,
    transform: [{ rotate: "14deg" }],
  },
  badgeRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  rolePill: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
  },
  rolePillText: {
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    letterSpacing: 0.2,
  },
  pendingPill: {
    minHeight: 20,
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: Theme.warningMuted,
  },
  pendingPillText: {
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.warning,
    letterSpacing: 0.2,
  },
  activePill: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: Theme.positiveMuted,
  },
  activePillText: {
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.darkGreen,
    letterSpacing: 0.2,
  },
  youPill: {
    minHeight: 20,
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.aggregatePillBorder,
  },
  youPillText: {
    fontSize: 8,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.aggregatePillText,
  },
  cardBody: {
    paddingHorizontal: 8,
    paddingBottom: 10,
    alignItems: "center",
    gap: 2,
  },
  avatarWrap: {
    marginTop: -29,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatarBorder: {
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  name: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    textAlign: "center",
    lineHeight: 14,
    marginTop: 4,
  },
  phone: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMutedDemo,
    textAlign: "center",
    marginTop: 1,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 6,
  },
  metaChip: {
    minHeight: 20,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  metaChipText: {
    fontSize: 8,
    fontWeight: "500",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  actionBtn: {
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
});

// ─── Empty States ──────────────────────────────────────────────────────────────

function EmptyMembers({ onInvite }: { onInvite?: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <Users size={32} color={Theme.textSection} strokeWidth={1.5} />
      <Text style={styles.emptyTitle}>No team members yet</Text>
      <Text style={styles.emptySub}>Invite colleagues to collaborate on your org.</Text>
      {onInvite && (
        <Pressable
          onPress={onInvite}
          style={({ pressed }) => [styles.emptyInviteBtn, pressed && { opacity: 0.8 }]}
        >
          <UserPlus2 size={14} color={Theme.textOnPrimary} strokeWidth={2.2} />
          <Text style={styles.emptyInviteBtnText}>Invite Member</Text>
        </Pressable>
      )}
    </View>
  );
}

function EmptyPending() {
  return (
    <View style={styles.emptyWrap}>
      <UserCheck size={32} color={Theme.textSection} strokeWidth={1.5} />
      <Text style={styles.emptyTitle}>No pending invites</Text>
      <Text style={styles.emptySub}>Sent invitations will appear here.</Text>
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TeamMembersView({
  orgId,
  currentUserId,
  canManage,
  onInvite,
  embedded = false,
  desktopMetronic = false,
}: {
  orgId: string;
  currentUserId: string | null;
  canManage: boolean;
  onInvite?: () => void;
  /** When true, omit outer ScrollView (parent scrolls). */
  embedded?: boolean;
  /** Metronic desktop hub — underline sub-tabs, tighter padding. */
  desktopMetronic?: boolean;
}) {
  const [tab, setTab] = useState<"members" | "pending">("members");
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const query = useOrgMembersQuery(orgId);
  const invalidate = useInvalidateOrgMembers(orgId);

  const all = query.data ?? [];
  const activeMembers = useMemo(() => all.filter((m) => m.status === "active"), [all]);
  const pendingMembers = useMemo(() => all.filter((m) => m.status === "invited"), [all]);

  const applySearch = (list: OrgMember[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        (m.full_name ?? "").toLowerCase().includes(q) ||
        (m.phone ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q),
    );
  };

  const displayList = applySearch(tab === "members" ? activeMembers : pendingMembers);

  const onRefresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const handleRoleChange = async (member: OrgMember, role: OrgMemberRole) => {
    setActionId(member.id);
    try {
      const { error } = await updateMemberRole(member.id, role);
      if (error) {
        Alert.alert("Could not update role", error.message);
        return;
      }
      invalidate();
      await query.refetch();
    } finally {
      setActionId(null);
    }
  };

  const handleRemove = (member: OrgMember) => {
    const displayName = member.full_name || member.phone || "this member";
    const isPending = member.status === "invited";
    Alert.alert(
      isPending ? "Cancel invitation?" : "Remove from team?",
      isPending
        ? `Cancel the invite sent to ${displayName}?`
        : `Remove ${displayName} from your team? They will lose access immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isPending ? "Cancel invite" : "Remove",
          style: "destructive",
          onPress: async () => {
            setActionId(member.id);
            try {
              const { error } = isPending
                ? await cancelTeamInvite(member.id)
                : await removeMember(member.id);
              if (error) {
                Alert.alert("Error", error.message);
                return;
              }
              invalidate();
              await query.refetch();
            } finally {
              setActionId(null);
            }
          },
        },
      ],
    );
  };

  if (query.isLoading && !query.data) {
    return (
      <View style={styles.centered}>
        <LoadingIndicator color={Theme.teslaRed} />
      </View>
    );
  }

  const numColumns = desktopMetronic ? 3 : 2;
  const rows: OrgMember[][] = [];
  for (let i = 0; i < displayList.length; i += numColumns) {
    rows.push(displayList.slice(i, i + numColumns));
  }

  const body = (
    <>
      <View
        style={[
          styles.tabRow,
          desktopMetronic && styles.tabRowMetronic,
          embedded && styles.tabRowEmbedded,
        ]}
      >
        {(["members", "pending"] as const).map((k) => {
          const on = tab === k;
          const count = k === "members" ? activeMembers.length : pendingMembers.length;
          return (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              style={[
                styles.tab,
                desktopMetronic && styles.tabMetronic,
                on && styles.tabOn,
                on && desktopMetronic && styles.tabOnMetronic,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  desktopMetronic && styles.tabTextMetronic,
                  on && styles.tabTextOn,
                  on && desktopMetronic && styles.tabTextOnMetronic,
                ]}
              >
                {k === "members" ? "Members" : "Pending"}
              </Text>
              {count > 0 ? (
                <View style={[styles.tabBadge, on && styles.tabBadgeOn]}>
                  <Text style={[styles.tabBadgeText, on && styles.tabBadgeTextOn]}>
                    {count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View
        style={[
          styles.searchRow,
          desktopMetronic && styles.searchRowMetronic,
          embedded && styles.searchRowEmbedded,
        ]}
      >
        <Search size={15} color={Theme.textSecondary} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone…"
          placeholderTextColor={Theme.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      {displayList.length === 0 ? (
        tab === "members" ? (
          <EmptyMembers onInvite={canManage ? onInvite : undefined} />
        ) : (
          <EmptyPending />
        )
      ) : (
        <View style={[styles.grid, embedded && styles.gridEmbedded]}>
          {rows.map((row, ri) => (
            <View key={`row-${ri}`} style={styles.gridRow}>
              {row.map((m) => (
                <View key={m.id} style={styles.gridCell}>
                  {actionId === m.id ? (
                    <View style={[styles.gridCell, styles.busyCard]}>
                      <LoadingIndicator color={Theme.teslaRed} />
                    </View>
                  ) : (
                    <MemberCard
                      member={m}
                      isCurrentUser={m.user_id === currentUserId}
                      canManage={canManage}
                      onRoleChange={handleRoleChange}
                      onRemove={handleRemove}
                    />
                  )}
                </View>
              ))}
              {row.length < numColumns
                ? Array.from({ length: numColumns - row.length }).map((_, i) => (
                    <View key={`spacer-${ri}-${i}`} style={styles.gridCell} />
                  ))
                : null}
            </View>
          ))}
        </View>
      )}

      {all.length > 0 ? (
        <View style={[styles.statsRow, embedded && styles.statsRowEmbedded]}>
          <View style={styles.statChip}>
            <UserCheck size={11} color={Theme.darkGreen} strokeWidth={2.2} />
            <Text style={styles.statText}>{activeMembers.length} active</Text>
          </View>
          {pendingMembers.length > 0 ? (
            <View style={styles.statChip}>
              <UserMinus size={11} color={Theme.warning} strokeWidth={2.2} />
              <Text style={[styles.statText, { color: Theme.warning }]}>
                {pendingMembers.length} pending
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedRoot}>{body}</View>;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.teslaRed} />
      }
    >
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  tabRow: {
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    marginBottom: 12,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabOn: { borderBottomColor: Theme.teslaRed },
  tabText: { ...Typography.subTabLabel, color: Theme.textSection },
  tabTextOn: { color: Theme.textPrimaryDark },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeOn: { backgroundColor: Theme.teslaRed },
  tabBadgeText: { fontSize: 9, fontWeight: "700", color: Theme.textSecondary },
  tabBadgeTextOn: { color: Theme.textOnPrimary },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Theme.surfaceGray,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    fontWeight: "500",
  },

  grid: { paddingHorizontal: 14, gap: 12 },
  gridRow: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  gridCell: { flex: 1, minWidth: 0 },
  busyCard: {
    backgroundColor: Theme.surface,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },

  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Theme.textSecondary, marginTop: 4 },
  emptySub: { fontSize: 12, color: Theme.textMuted, textAlign: "center", lineHeight: 17 },
  emptyInviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: Theme.primary,
  },
  emptyInviteBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
    paddingBottom: 4,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  statText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },

  embeddedRoot: {
    width: "100%",
  },
  tabRowMetronic: {
    gap: 24,
    paddingHorizontal: 20,
    borderBottomColor: "#EFF2F5",
  },
  tabRowEmbedded: {
    marginBottom: 10,
  },
  tabMetronic: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    marginBottom: -1,
  },
  tabOnMetronic: {
    borderBottomColor: Theme.primary,
  },
  tabTextMetronic: {
    fontSize: 13,
    fontWeight: "500",
    color: "#A1A5B7",
    letterSpacing: 0,
  },
  tabTextOnMetronic: {
    color: "#181C32",
    fontWeight: "600",
  },
  searchRowMetronic: {
    marginHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EFF2F5",
    backgroundColor: "#FAFBFC",
  },
  searchRowEmbedded: {
    marginBottom: 16,
  },
  gridEmbedded: {
    paddingHorizontal: 20,
  },
  statsRowEmbedded: {
    paddingHorizontal: 20,
    marginTop: 16,
    paddingBottom: 16,
  },
});
