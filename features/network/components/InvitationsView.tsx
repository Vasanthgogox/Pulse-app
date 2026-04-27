/**
 * Network — Invitations: incoming (accept / reject) and sent (withdraw pending).
 * Reference layout: white cards, pill labels (SENT / role / status), inner grey band, relative time.
 */
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import Typography from "@/constants/Typography";
import { getInitials } from "@/lib/stringUtils";
import {
  useConnectionRequestsReceivedQuery,
  useConnectionRequestsSentQuery,
  useInvalidateNetwork,
} from "@/lib/queries";
import {
  approveConnectionRequest,
  cancelConnectionRequest,
  rejectConnectionRequest,
  type ConnectionRequestRow,
} from "@/services/connectionRequestsService";
import { Check, Clock3, Search, Send, UserPlus2, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

function formatRelativeShort(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d`;
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, m)}m`;
}

function rolePillText(row: ConnectionRequestRow): string {
  if (row.request_shipper_client) return "ADD AS CLIENT";
  return "ADD AS SUPPLIER";
}

function HubCardIncoming({
  row,
  busy,
  onAccept,
  onReject,
}: {
  row: ConnectionRequestRow;
  busy: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const isPending = row.status === "pending";
  const fromOrg = row as ConnectionRequestRow & {
    from_org_avatar_url?: string | null;
    from_org_avatar_seed?: string | null;
  };
  const ratingValue = (row as ConnectionRequestRow & { rating?: number | null; average_rating?: number | null }).rating
    ?? (row as ConnectionRequestRow & { rating?: number | null; average_rating?: number | null }).average_rating
    ?? null;
  const rating =
    typeof ratingValue === "number" && Number.isFinite(ratingValue)
      ? `${ratingValue.toFixed(1)}★`
      : "No rating";
  return (
    <View style={hubStyles.card}>
      <View style={hubStyles.inviteCover}>
        <View style={hubStyles.coverOrbLarge} />
        <View style={hubStyles.coverOrbSmall} />
        <View style={hubStyles.coverPlane} />
        <View style={[hubStyles.coverRatingNode, rating === "No rating" && hubStyles.coverRatingNodeEmpty]}>
          <Text
            style={[
              hubStyles.coverRatingText,
              rating === "No rating" && hubStyles.coverRatingTextEmpty,
            ]}
          >
            {rating}
          </Text>
        </View>
        <View style={hubStyles.cardHeader}>
          <View style={hubStyles.modeBadge}>
            <UserPlus2 size={10} color={Theme.textPrimaryDark} strokeWidth={2.4} />
            <Text style={hubStyles.modeBadgeText}>Received</Text>
          </View>
          <View style={hubStyles.roleBadge}>
            <Text style={hubStyles.roleBadgeText}>{rolePillText(row)}</Text>
          </View>
          <View style={[hubStyles.statusPill, isPending ? hubStyles.statusPending : hubStyles.statusMuted]}>
            <Clock3 size={10} color={Theme.warning} strokeWidth={2.4} />
            <Text style={hubStyles.statusPillText}>{(row.status ?? "PENDING").toUpperCase()}</Text>
          </View>
        </View>
      </View>
      <View style={hubStyles.inviteBody}>
        <View style={hubStyles.avatar}>
          <PartyAvatar
            name={(row.from_org_name ?? "?").toUpperCase()}
            avatarUrl={fromOrg.from_org_avatar_url ?? null}
            avatarSeed={fromOrg.from_org_avatar_seed ?? null}
            entityType="client"
            size={62}
            borderStyle={hubStyles.avatarImage}
          />
        </View>
        <View style={hubStyles.innerText}>
          <Text style={hubStyles.name} numberOfLines={1}>
            {(row.from_org_name ?? "—").toUpperCase()}
          </Text>
          <Text style={hubStyles.subtitle} numberOfLines={2}>
            Wants to connect with your network
          </Text>
          <View style={hubStyles.metaRow}>
            <View style={hubStyles.metaChip}>
              <Text style={hubStyles.metaChipText}>{formatRelativeShort(row.created_at)} ago</Text>
            </View>
            <View style={hubStyles.ratingChip}>
              <Text
                style={[
                  hubStyles.ratingChipText,
                  rating === "No rating" && hubStyles.ratingChipTextEmpty,
                ]}
              >
                {rating}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={hubStyles.cardFooter}>
        {isPending && !busy ? (
          <View style={hubStyles.incomingActions}>
            <Pressable
              onPress={() => onReject(row.id)}
              style={({ pressed }) => [hubStyles.rejectBtn, pressed && { opacity: 0.7 }]}
              hitSlop={6}
            >
              <X size={12} color={Theme.textSecondary} strokeWidth={2.5} />
              <Text style={hubStyles.rejectBtnTxt}>Ignore</Text>
            </Pressable>
            <Pressable
              onPress={() => onAccept(row.id)}
              style={({ pressed }) => [hubStyles.acceptPill, pressed && { opacity: 0.9 }]}
            >
              <Check size={13} color={Theme.textOnPrimary} strokeWidth={2.8} />
              <Text style={hubStyles.acceptPillTxt}>Authorize</Text>
            </Pressable>
          </View>
        ) : busy ? (
          <ActivityIndicator size="small" color={Theme.teslaRed} />
        ) : null}
      </View>
    </View>
  );
}

function HubCardSent({
  row,
  busy,
  onWithdraw,
}: {
  row: ConnectionRequestRow;
  busy: boolean;
  onWithdraw: (id: string) => void;
}) {
  const isPending = row.status === "pending";
  const toOrg = row as ConnectionRequestRow & {
    to_org_avatar_url?: string | null;
    to_org_avatar_seed?: string | null;
  };
  const ratingValue = (row as ConnectionRequestRow & { rating?: number | null; average_rating?: number | null }).rating
    ?? (row as ConnectionRequestRow & { rating?: number | null; average_rating?: number | null }).average_rating
    ?? null;
  const rating =
    typeof ratingValue === "number" && Number.isFinite(ratingValue)
      ? `${ratingValue.toFixed(1)}★`
      : "No rating";
  return (
    <View style={hubStyles.card}>
      <View style={hubStyles.inviteCover}>
        <View style={hubStyles.coverOrbLarge} />
        <View style={hubStyles.coverOrbSmall} />
        <View style={hubStyles.coverPlane} />
        <View style={[hubStyles.coverRatingNode, rating === "No rating" && hubStyles.coverRatingNodeEmpty]}>
          <Text
            style={[
              hubStyles.coverRatingText,
              rating === "No rating" && hubStyles.coverRatingTextEmpty,
            ]}
          >
            {rating}
          </Text>
        </View>
        <View style={hubStyles.cardHeader}>
          <View style={hubStyles.modeBadge}>
            <Send size={10} color={Theme.textPrimaryDark} strokeWidth={2.4} />
            <Text style={hubStyles.modeBadgeText}>Sent</Text>
          </View>
          <View style={hubStyles.roleBadge}>
            <Text style={hubStyles.roleBadgeText}>{rolePillText(row)}</Text>
          </View>
          <View style={[hubStyles.statusPill, isPending ? hubStyles.statusPending : hubStyles.statusMuted]}>
            <Clock3 size={10} color={Theme.warning} strokeWidth={2.4} />
            <Text style={hubStyles.statusPillText}>{(row.status ?? "PENDING").toUpperCase()}</Text>
          </View>
        </View>
      </View>
      <View style={hubStyles.inviteBody}>
        <View style={hubStyles.avatar}>
          <PartyAvatar
            name={(row.to_org_name ?? "?").toUpperCase()}
            avatarUrl={toOrg.to_org_avatar_url ?? null}
            avatarSeed={toOrg.to_org_avatar_seed ?? null}
            entityType="supplier"
            size={62}
            borderStyle={hubStyles.avatarImage}
          />
        </View>
        <View style={hubStyles.innerText}>
          <Text style={hubStyles.name} numberOfLines={1}>
            {(row.to_org_name ?? "—").toUpperCase()}
          </Text>
          <Text style={hubStyles.subtitle} numberOfLines={2}>
            Invitation shared from your network hub
          </Text>
          <View style={hubStyles.metaRow}>
            <View style={hubStyles.metaChip}>
              <Text style={hubStyles.metaChipText}>{formatRelativeShort(row.created_at)} ago</Text>
            </View>
            <View style={hubStyles.ratingChip}>
              <Text
                style={[
                  hubStyles.ratingChipText,
                  rating === "No rating" && hubStyles.ratingChipTextEmpty,
                ]}
              >
                {rating}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={hubStyles.cardFooter}>
        {isPending ? (
          <Pressable
            onPress={() => onWithdraw(row.id)}
            disabled={busy}
            style={({ pressed }) => [hubStyles.withdrawBtn, pressed && { opacity: 0.9 }]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={hubStyles.withdrawBtnTxt}>WITHDRAW</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export type InvitationsViewVariant = "default" | "hub";

export function InvitationsView({
  orgId,
  embedded,
  variant = "default",
  subTab: subTabProp,
  onSubTabChange,
  search: searchProp,
  onSearchChange,
}: {
  orgId: string;
  /** When true, content is a static block (e.g. inside a parent ScrollView). */
  embedded?: boolean;
  /** Hub: parent owns RECEIVED / SENT + search; single stack of reference cards. */
  variant?: InvitationsViewVariant;
  subTab?: "received" | "sent";
  onSubTabChange?: (t: "received" | "sent") => void;
  search?: string;
  onSearchChange?: (q: string) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const receivedQ = useConnectionRequestsReceivedQuery(orgId);
  const sentQ = useConnectionRequestsSentQuery(orgId);
  const invalidate = useInvalidateNetwork(orgId);
  const [actionId, setActionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [subTabI, setSubTabI] = useState<"received" | "sent">("received");
  const [searchI, setSearchI] = useState("");

  const subTab = subTabProp ?? subTabI;
  const setSubTab = (t: "received" | "sent") => {
    if (onSubTabChange) onSubTabChange(t);
    else setSubTabI(t);
  };
  const search = searchProp ?? searchI;
  const setSearch = onSearchChange ?? setSearchI;

  const isHub = variant === "hub";
  const hubNumColumns = windowWidth >= 760 ? 5 : 2;

  const pendingReceived = useMemo(
    () => (receivedQ.data ?? []).filter((r) => r.status === "pending") as ConnectionRequestRow[],
    [receivedQ.data],
  );
  const sent = useMemo(() => (sentQ.data ?? []) as ConnectionRequestRow[], [sentQ.data]);

  const filterBySearch = (rows: ConnectionRequestRow[], name: (r: ConnectionRequestRow) => string) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (name(r) ?? "").toLowerCase().includes(q));
  };

  const receivedFiltered = useMemo(
    () => filterBySearch(pendingReceived, (r) => r.from_org_name),
    [pendingReceived, search],
  );
  const sentFiltered = useMemo(
    () => filterBySearch(sent, (r) => r.to_org_name),
    [sent, search],
  );

  const hubItems = subTab === "received" ? receivedFiltered : sentFiltered;
  const hubRows = useMemo(() => {
    const limited = hubItems.slice(0, hubNumColumns * 2);
    const rows: ConnectionRequestRow[][] = [];
    for (let i = 0; i < limited.length; i += hubNumColumns) {
      rows.push(limited.slice(i, i + hubNumColumns));
    }
    return rows;
  }, [hubItems, hubNumColumns]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([receivedQ.refetch(), sentQ.refetch()]);
    setRefreshing(false);
  };

  const refreshInvitationState = async () => {
    invalidate();
    await Promise.all([receivedQ.refetch(), sentQ.refetch()]);
  };

  const handleAccept = async (id: string) => {
    setActionId(id);
    try {
      const res = await approveConnectionRequest(id, orgId);
      if (res.error) {
        Alert.alert("Could not accept request", res.error.message);
        return;
      }
      if (!res.updated) {
        Alert.alert(
          "Request already changed",
          "This invitation is no longer pending. Refreshing the latest network state.",
        );
      }
      await refreshInvitationState();
    } finally {
      setActionId(null);
    }
  };
  const handleReject = async (id: string) => {
    setActionId(id);
    try {
      const res = await rejectConnectionRequest(id, orgId);
      if (res.error) {
        Alert.alert("Could not ignore request", res.error.message);
        return;
      }
      if (!res.updated) {
        Alert.alert(
          "Request already changed",
          "This invitation is no longer pending. Refreshing the latest network state.",
        );
      }
      await refreshInvitationState();
    } finally {
      setActionId(null);
    }
  };
  const handleCancel = async (id: string) => {
    setActionId(id);
    try {
      const res = await cancelConnectionRequest(id);
      if (res.error) {
        Alert.alert("Could not withdraw request", res.error.message);
        return;
      }
      if (!res.deleted) {
        Alert.alert(
          "Request already changed",
          "This invitation is no longer pending. Refreshing the latest network state.",
        );
      }
      await refreshInvitationState();
    } finally {
      setActionId(null);
    }
  };

  if (receivedQ.isLoading && sentQ.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Theme.teslaRed} />
      </View>
    );
  }

  const defaultBody = (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>INCOMING</Text>
      </View>
      {pendingReceived.length === 0 ? (
        <View style={styles.emptyInbox}>
          <Text style={styles.emptyInboxTitle}>No pending invitations</Text>
        </View>
      ) : (
        pendingReceived.map((r) => (
          <HubCardIncoming
            key={r.id}
            row={r}
            busy={actionId === r.id}
            onAccept={handleAccept}
            onReject={handleReject}
          />
        ))
      )}

      <View style={[styles.sectionHeader, { marginTop: 20 }]}>
        <Text style={styles.sectionTitle}>SENT</Text>
      </View>
      {sent.length === 0 ? (
        <View style={styles.emptyInbox}>
          <Text style={styles.emptyInboxSub}>No sent requests</Text>
        </View>
      ) : (
        sent.map((r) => (
          <HubCardSent key={r.id} row={r} busy={actionId === r.id} onWithdraw={handleCancel} />
        ))
      )}
    </>
  );

  const hubList =
    hubItems.length === 0 ? (
      <View style={styles.emptyInbox}>
        <Text style={styles.emptyInboxSub}>
          {subTab === "received" ? "No pending invitations" : "No sent invitations"}
        </Text>
      </View>
    ) : (
      hubRows.map((row, ri) => (
        <View key={`hub-invite-row-${ri}`} style={styles.hubGridRow}>
          {row.map((r) => (
            <View key={r.id} style={styles.hubCardCell}>
              {subTab === "received" ? (
                <HubCardIncoming
                  row={r}
                  busy={actionId === r.id}
                  onAccept={handleAccept}
                  onReject={handleReject}
                />
              ) : (
                <HubCardSent row={r} busy={actionId === r.id} onWithdraw={handleCancel} />
              )}
            </View>
          ))}
          {row.length < hubNumColumns
            ? Array.from({ length: hubNumColumns - row.length }).map((_, i) => (
                <View key={`hub-invite-spacer-${ri}-${i}`} style={styles.hubGridSpacer} />
              ))
            : null}
        </View>
      ))
    );

  const showInternalSubTabs = isHub && !embedded && !onSubTabChange;

  const hubSearchBar = isHub && !embedded ? (
    <View>
      {showInternalSubTabs ? (
        <View style={styles.hubSubTabsRow}>
          {(["received", "sent"] as const).map((k) => {
            const on = subTab === k;
            return (
              <Pressable
                key={k}
                onPress={() => setSubTab(k)}
                style={[styles.hubSubTab, on && styles.hubSubTabOn]}
              >
                <Text style={[styles.hubSubTabText, on && styles.hubSubTabTextOn]}>
                  {k === "received" ? "RECEIVED" : "SENT"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={styles.hubSearchRow}>
        <Search size={16} color={Theme.textSecondary} />
        <TextInput
          style={styles.hubSearchInput}
          placeholder={subTab === "received" ? "Search received…" : "Search sent invitations…"}
          placeholderTextColor={Theme.textSecondary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>
    </View>
  ) : null;

  const body = isHub ? (
    <View style={styles.hubGrid}>{hubList}</View>
  ) : (
    defaultBody
  );

  if (embedded) {
    return <View style={styles.embeddedWrap}>{body}</View>;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.teslaRed} />
      }
    >
      {isHub && hubSearchBar}
      {body}
    </ScrollView>
  );
}

const hubStyles = StyleSheet.create({
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
  inviteCover: {
    height: 82,
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  coverOrbLarge: {
    position: "absolute",
    width: 132,
    height: 70,
    borderRadius: 66,
    top: -20,
    left: -28,
    backgroundColor: Theme.borderLight,
    transform: [{ rotate: "-10deg" }],
  },
  coverOrbSmall: {
    position: "absolute",
    width: 92,
    height: 54,
    borderRadius: 46,
    right: -22,
    bottom: -16,
    backgroundColor: Theme.surface,
    transform: [{ rotate: "14deg" }],
  },
  coverPlane: {
    position: "absolute",
    width: 112,
    height: 52,
    borderRadius: 14,
    right: 28,
    top: 10,
    backgroundColor: Theme.screenBackground,
    opacity: 0.55,
    transform: [{ rotate: "-8deg" }],
  },
  coverRatingNode: {
    position: "absolute",
    right: 8,
    bottom: 8,
    minHeight: 23,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  coverRatingNodeEmpty: {
    minHeight: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  coverRatingText: {
    fontSize: 10,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  coverRatingTextEmpty: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: -0.1,
  },
  cardHeader: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  badgeStack: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  modeBadge: {
    minHeight: 21,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  modeBadgeText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  roleBadge: {
    minHeight: 21,
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  roleBadgeText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  pillBlueBorder: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Theme.primary,
  },
  pillBlueBorderText: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.primary,
    letterSpacing: 0.4,
  },
  statusPill: {
    minHeight: 21,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    borderRadius: 10,
  },
  statusPending: { backgroundColor: Theme.warningMuted },
  statusMuted: { backgroundColor: Theme.screenBackground },
  statusPillText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  inviteBody: {
    flexDirection: "column",
    alignItems: "center",
    minHeight: 122,
    paddingHorizontal: 8,
    paddingTop: 0,
    paddingBottom: 10,
    gap: 7,
  },
  innerBand: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceForm,
    borderRadius: 16,
    padding: 10,
    gap: 10,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    marginTop: -31,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  avatarImage: {
    borderWidth: 2,
    borderColor: Theme.screenBackground,
  },
  avatarTxt: {
    fontSize: 16,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  innerText: { width: "100%", minWidth: 0, alignItems: "center" },
  name: {
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    textAlign: "center",
    lineHeight: 15,
  },
  subtitle: {
    fontSize: 9,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textMutedDemo,
    lineHeight: 12,
    textAlign: "center",
    marginTop: 2,
    minHeight: 24,
  },
  timeLabel: { fontSize: 9, color: Theme.textSecondary, marginTop: 2, fontWeight: "400", fontStyle: "italic" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 7,
  },
  metaChip: {
    minHeight: 22,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  metaChipText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  metaChipStrong: {
    minHeight: 22,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: Theme.textPrimaryDark,
  },
  metaChipStrongText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
  },
  withdrawBtn: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  withdrawBtnTxt: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.teslaRed,
    letterSpacing: 0.1,
  },
  ratingChip: {
    minHeight: 22,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  ratingChipText: {
    fontSize: 8,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
  ratingChipTextEmpty: {
    color: Theme.textMutedDemo,
  },
  incomingActions: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" },
  rejectBtn: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  rejectBtnTxt: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textSecondary,
  },
  ghostBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  ghostBtnTxt: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  acceptPill: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: Theme.textPrimaryDark,
  },
  acceptPillTxt: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textOnPrimary,
    letterSpacing: 0.1,
  },
  cardFooter: {
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
});

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  embeddedWrap: { paddingBottom: 8 },
  listContent: { paddingBottom: 32 },
  hubGrid: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  hubGridRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  hubCardCell: {
    flex: 1,
    minWidth: 0,
  },
  hubGridSpacer: {
    flex: 1,
    minWidth: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  sectionTitle: { ...Typography.subTabLabel, color: Theme.textSection },
  hubSubTabsRow: {
    flexDirection: "row",
    gap: 16,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  hubSubTab: {
    paddingVertical: 6,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  hubSubTabOn: { borderBottomColor: Theme.teslaRed },
  hubSubTabText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: Theme.textSection,
  },
  hubSubTabTextOn: { color: Theme.textPrimaryDark },
  hubSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Theme.cinematicHeaderChipBg,
  },
  hubSearchInput: { flex: 1, fontSize: 14, color: Theme.textPrimaryDark, fontWeight: "500" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyInbox: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  emptyInboxTitle: { fontSize: 14, fontWeight: "700", color: Theme.textSecondary, marginTop: 8 },
  emptyInboxSub: { fontSize: 12, color: Theme.textSecondary, textAlign: "center" },
});
