/**
 * Team members list: active members and pending invites.
 * Matches InvitationsView / ConnectionsView hub styling.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { PartyAvatar } from "@/components/PartyAvatar";
import { DomainJoinRequestsPanel } from "@/features/organization/components/DomainJoinRequestsPanel";
import { useOrgMembersQuery, useInvalidateOrgMembers } from "@/lib/queries/useOrgMembersQuery";
import {
  cancelTeamInvite,
  updateBulkMemberPermissions,
} from "@/features/organization/services/members.service";
import type { OrgMember, PendingPhoneTeamInvite } from "@/types/organization";
import {
  buildTeamInvitePermissions,
  memberDisplayRoleLabel,
  platformRoleFromMember,
  TEAM_INVITE_ROLE_OPTIONS,
  type PlatformTeamRole,
} from "@/features/organization/utils/teamInviteRoles.util";
import { useOrgCapabilities } from "@/lib/useCapabilities";
import {
  Check,
  CheckSquare,
  Pencil,
  Search,
  Shield,
  Square,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus2,
  Users,
  X,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
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
import { confirmDialog } from "@/lib/confirmDialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleLabel(member: OrgMember): string {
  return memberDisplayRoleLabel(member);
}

function roleBadgeColor(member: OrgMember): string {
  const platform = platformRoleFromMember(member);
  if (member.role === "owner") return Theme.primary;
  if (platform === "admin" || member.role === "admin") return Theme.darkGreen;
  if (platform === "planner" || member.role === "dispatcher") return Theme.pulseIndigo;
  return Theme.textSecondary;
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

const COVER_HEIGHT = 40;
const AVATAR_SIZE = 52;
const AVATAR_RING = 56;
/** How far the avatar hangs below the cover into the body. */
const AVATAR_HANG = 28;
const FOOTER_HEIGHT = 40;

function RolePill({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  return (
    <View
      style={[
        cardStyles.pill,
        cardStyles.rolePill,
        { borderColor: color },
      ]}
      accessibilityLabel={`Role ${label}`}
    >
      <Shield size={9} color={color} strokeWidth={2.4} />
      <Text style={[cardStyles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatusPill({
  tone,
  label,
  accessibilityLabel,
}: {
  tone: "active" | "pending" | "warning";
  label: string;
  accessibilityLabel?: string;
}) {
  const toneStyle =
    tone === "active"
      ? cardStyles.statusActive
      : tone === "warning"
        ? cardStyles.statusWarning
        : cardStyles.statusPending;
  const textStyle =
    tone === "active"
      ? cardStyles.statusActiveText
      : tone === "warning"
        ? cardStyles.statusWarningText
        : cardStyles.statusPendingText;
  return (
    <View
      style={[cardStyles.pill, cardStyles.statusPill, toneStyle]}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {tone === "active" ? (
        <Check size={9} color={Theme.darkGreen} strokeWidth={2.8} />
      ) : null}
      <Text style={[cardStyles.pillText, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function TeamRosterCardShell({
  selected = false,
  checkbox,
  leftBadges,
  rightBadge,
  avatarName,
  avatarSeed,
  avatarUrl,
  children,
  footer,
}: {
  selected?: boolean;
  checkbox?: React.ReactNode;
  leftBadges: React.ReactNode;
  rightBadge: React.ReactNode;
  avatarName: string;
  avatarSeed: string;
  avatarUrl?: string | null;
  children: React.ReactNode;
  footer?: React.ReactNode | null;
}) {
  return (
    <View style={[cardStyles.card, selected && cardStyles.cardSelected]}>
      {checkbox}
      <View style={cardStyles.cardCover}>
        <View style={cardStyles.badgeRow}>
          <View style={cardStyles.badgeCluster}>{leftBadges}</View>
          <View style={cardStyles.badgeClusterEnd}>{rightBadge}</View>
        </View>
      </View>

      {/* Absolute, full-width centering — avoids flex/web off-center avatars. */}
      <View style={cardStyles.avatarAnchor} pointerEvents="none">
        <View style={cardStyles.avatarRing}>
          <PartyAvatar
            name={avatarName}
            initialsColorSeed={avatarSeed}
            avatarUrl={avatarUrl ?? null}
            size={AVATAR_SIZE}
            shape="circle"
            style={cardStyles.avatarInner}
          />
        </View>
      </View>

      <View style={cardStyles.cardBody}>{children}</View>

      {/* Always reserve footer height so paired cards match. */}
      <View style={cardStyles.footerSlot}>
        {footer ?? <View style={cardStyles.footerPlaceholder} />}
      </View>
    </View>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({
  member,
  isCurrentUser,
  canManage,
  onEdit,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  member: OrgMember;
  isCurrentUser: boolean;
  canManage: boolean;
  onEdit: (member: OrgMember) => void;
  /** Bulk mode — show a checkbox instead of routing to the detail panel. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (member: OrgMember) => void;
}) {
  const displayName = member.full_name || member.phone || member.email || "Unknown";
  const isOwner = member.role === "owner";
  const isPending = member.status === "pending";
  const canEdit = canManage && !isOwner && !isCurrentUser;
  // Owner rows and your own row are never bulk-editable (RLS rejects them too).
  const canSelect = selectable && canEdit;

  return (
    <TeamRosterCardShell
      selected={selected}
      avatarName={displayName}
      avatarSeed={member.id}
      avatarUrl={member.avatar_url}
      checkbox={
        canSelect ? (
          <Pressable
            onPress={() => onToggleSelect?.(member)}
            hitSlop={8}
            style={cardStyles.checkboxWrap}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`Select ${displayName}`}
          >
            {selected ? (
              <CheckSquare size={18} color={Theme.accentBrown} strokeWidth={2.4} />
            ) : (
              <Square size={18} color={Theme.textSecondary} strokeWidth={2.2} />
            )}
          </Pressable>
        ) : null
      }
      leftBadges={
        <>
          <RolePill label={roleLabel(member)} color={roleBadgeColor(member)} />
          {isCurrentUser ? (
            <View style={[cardStyles.pill, cardStyles.youPill]}>
              <Text style={[cardStyles.pillText, cardStyles.youPillText]}>YOU</Text>
            </View>
          ) : null}
        </>
      }
      rightBadge={
        isPending ? (
          <StatusPill tone="pending" label="PENDING" />
        ) : (
          <StatusPill tone="active" label="ACTIVE" />
        )
      }
      footer={
        canSelect ? (
          <Pressable
            onPress={() => onToggleSelect?.(member)}
            style={({ pressed }) => [cardStyles.footerBtn, pressed && { opacity: 0.82 }]}
          >
            <Text style={cardStyles.footerBtnText}>
              {selected ? "Selected" : "Select"}
            </Text>
          </Pressable>
        ) : canEdit ? (
          <Pressable
            onPress={() => onEdit(member)}
            style={({ pressed }) => [cardStyles.footerBtn, pressed && { opacity: 0.82 }]}
          >
            <Pencil size={13} color={Theme.accentBrownDeep} strokeWidth={2.2} />
            <Text style={cardStyles.footerBtnText}>Edit</Text>
          </Pressable>
        ) : null
      }
    >
      <View style={cardStyles.identityBlock}>
        <Text style={cardStyles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={cardStyles.phone} numberOfLines={1}>
          {member.phone?.trim() || "—"}
        </Text>
        <Text
          style={[cardStyles.email, !member.email?.trim() && cardStyles.emailMuted]}
          numberOfLines={1}
        >
          {member.email?.trim() || "No email"}
        </Text>
        <View style={cardStyles.metaPill}>
          <Text style={cardStyles.metaPillText}>{formatRelative(member.joined_at)}</Text>
        </View>
      </View>
    </TeamRosterCardShell>
  );
}

// ─── Pending phone invite (no Pulse account yet) ───────────────────────────────

function PendingPhoneInviteCard({
  invite,
  canManage,
  onCancel,
}: {
  invite: PendingPhoneTeamInvite;
  canManage: boolean;
  onCancel: (invite: PendingPhoneTeamInvite) => void;
}) {
  const roleText = memberDisplayRoleLabel({
    role: invite.role,
    permissions: invite.permissions,
  });
  const statusLabel = invite.email_conflict ? "EXISTS" : "SIGNUP";
  const statusA11y = invite.email_conflict
    ? "Account already exists"
    : "Awaiting signup";

  return (
    <TeamRosterCardShell
      avatarName={invite.invitee_name}
      avatarSeed={invite.id}
      leftBadges={<RolePill label={roleText} color={Theme.accentBrown} />}
      rightBadge={
        <StatusPill
          tone={invite.email_conflict ? "warning" : "pending"}
          label={statusLabel}
          accessibilityLabel={statusA11y}
        />
      }
      footer={
        canManage ? (
          <Pressable
            onPress={() => onCancel(invite)}
            style={({ pressed }) => [
              cardStyles.footerBtn,
              cardStyles.footerBtnDanger,
              pressed && { opacity: 0.82 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Cancel invite for ${invite.invitee_name}`}
          >
            <Trash2 size={13} color={Theme.destructive} strokeWidth={2.2} />
            <Text style={[cardStyles.footerBtnText, cardStyles.footerBtnTextDanger]}>
              Cancel invite
            </Text>
          </Pressable>
        ) : null
      }
    >
      <View style={cardStyles.identityBlock}>
        <Text style={cardStyles.name} numberOfLines={1}>
          {invite.invitee_name}
        </Text>
        <Text style={cardStyles.phone} numberOfLines={1}>
          {invite.invitee_phone}
        </Text>
        <Text
          style={[
            cardStyles.email,
            !invite.invitee_email?.trim() && cardStyles.emailMuted,
          ]}
          numberOfLines={1}
        >
          {invite.invitee_email?.trim() || "No email on invite"}
        </Text>
        <View style={cardStyles.metaPill}>
          <Text style={cardStyles.metaPillText}>
            Invited {formatRelative(invite.created_at)}
          </Text>
        </View>
        {invite.email_conflict ? (
          <View style={cardStyles.conflictBox}>
            <Text style={cardStyles.conflictTitle}>Pulse account found</Text>
            <Text style={cardStyles.conflictText} numberOfLines={3}>
              {invite.conflict_org_names?.length
                ? `Linked to ${invite.conflict_org_names.join(", ")}. Sign in — don’t sign up again.`
                : "Email already registered. Ask them to sign in to accept."}
            </Text>
          </View>
        ) : (
          <Text style={cardStyles.phoneHint} numberOfLines={2}>
            Joins when they sign up with this phone number.
          </Text>
        )}
      </View>
    </TeamRosterCardShell>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "column",
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: "hidden",
  },
  cardSelected: {
    borderColor: Theme.accentBrown,
    borderWidth: 1.5,
  },
  checkboxWrap: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 5,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  cardCover: {
    height: COVER_HEIGHT,
    backgroundColor: Theme.accentBrownWash,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.accentBrownBorder,
    zIndex: 1,
  },
  badgeRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 8,
  },
  badgeCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  badgeClusterEnd: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  pill: {
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  rolePill: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  statusPill: {
    flexShrink: 0,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    lineHeight: 11,
    flexShrink: 1,
  },
  statusActive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: "rgba(21, 128, 61, 0.28)",
  },
  statusActiveText: {
    color: Theme.darkGreen,
  },
  statusPending: {
    backgroundColor: Theme.accentBrownMuted,
    borderColor: Theme.accentBrownBorder,
  },
  statusPendingText: {
    color: Theme.accentBrownDeep,
  },
  statusWarning: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.28)",
  },
  statusWarningText: {
    color: Theme.warning,
  },
  youPill: {
    backgroundColor: Theme.aggregatePillBg,
    borderColor: Theme.aggregatePillBorder,
    flexShrink: 0,
  },
  youPillText: {
    color: Theme.aggregatePillText,
  },
  avatarAnchor: {
    position: "absolute",
    top: COVER_HEIGHT - AVATAR_HANG,
    left: 0,
    right: 0,
    height: AVATAR_RING,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  avatarRing: {
    width: AVATAR_RING,
    height: AVATAR_RING,
    borderRadius: AVATAR_RING / 2,
    borderWidth: 3,
    borderColor: Theme.cardWhite,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarInner: {
    borderWidth: 0,
  },
  cardBody: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 12,
    paddingTop: AVATAR_HANG + 10,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  identityBlock: {
    width: "100%",
    alignItems: "center",
    gap: 5,
  },
  name: {
    width: "100%",
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    textAlign: "center",
    lineHeight: 18,
    minHeight: 18,
  },
  phone: {
    width: "100%",
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    lineHeight: 16,
    minHeight: 16,
  },
  email: {
    width: "100%",
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 15,
    minHeight: 15,
    paddingHorizontal: 2,
  },
  emailMuted: {
    fontStyle: "italic",
    color: Theme.textMuted,
  },
  conflictBox: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.accentBrownBorder,
    backgroundColor: Theme.accentBrownWash,
    width: "100%",
    gap: 2,
  },
  conflictTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.accentBrownDeep,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  conflictText: {
    fontSize: 10,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 13,
  },
  phoneHint: {
    marginTop: 4,
    fontSize: 10,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 13,
    paddingHorizontal: 2,
    minHeight: 26,
  },
  metaPill: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  metaPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  footerSlot: {
    flexShrink: 0,
    height: FOOTER_HEIGHT,
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  footerPlaceholder: {
    flex: 1,
    height: FOOTER_HEIGHT,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: FOOTER_HEIGHT,
    width: "100%",
  },
  footerBtnDanger: {
    backgroundColor: "rgba(232, 33, 39, 0.04)",
  },
  footerBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.accentBrownDeep,
    letterSpacing: -0.1,
  },
  footerBtnTextDanger: {
    color: Theme.destructive,
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
          <UserPlus2 size={14} color={Theme.buttonPrimaryText} strokeWidth={2.2} />
          <Text style={styles.emptyInviteBtnText}>Invite Member</Text>
        </Pressable>
      )}
    </View>
  );
}

function EmptyPending({ onInvite }: { onInvite?: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <UserCheck size={32} color={Theme.textSection} strokeWidth={1.5} />
      <Text style={styles.emptyTitle}>No pending invites</Text>
      <Text style={styles.emptySub}>
        Sent invitations appear here. New employees without a Pulse account show as
        awaiting signup until they register with the invited phone number.
      </Text>
      {onInvite ? (
        <Pressable
          onPress={onInvite}
          style={({ pressed }) => [styles.emptyInviteBtn, pressed && { opacity: 0.8 }]}
        >
          <UserPlus2 size={14} color={Theme.buttonPrimaryText} strokeWidth={2.2} />
          <Text style={styles.emptyInviteBtnText}>Invite member</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TeamMembersView({
  orgId,
  currentUserId,
  canManage,
  onInvite,
  onEditMember,
  embedded = false,
  desktopMetronic = false,
  initialSubTab,
}: {
  orgId: string;
  currentUserId: string | null;
  canManage: boolean;
  onInvite?: () => void;
  /** When set, Edit stays in the current layout instead of opening the full-page permissions modal. */
  onEditMember?: (member: OrgMember) => void;
  /** When true, omit outer ScrollView (parent scrolls). */
  embedded?: boolean;
  /** Metronic desktop hub — underline sub-tabs, tighter padding. */
  desktopMetronic?: boolean;
  /** After inline invite, open on pending tab. */
  initialSubTab?: "members" | "pending";
}) {
  const [tab, setTab] = useState<"members" | "pending">(
    () => initialSubTab ?? "members",
  );
  const [search, setSearch] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Bulk role assignment ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const orgCaps = useOrgCapabilities();

  React.useEffect(() => {
    if (initialSubTab) setTab(initialSubTab);
  }, [initialSubTab]);

  const query = useOrgMembersQuery(orgId);
  const invalidate = useInvalidateOrgMembers(orgId);
  const router = useRouter();

  const handleEditMember = (member: OrgMember) => {
    if (onEditMember) {
      onEditMember(member);
      return;
    }
    router.push(
      (`/(modals)/member-permissions?memberId=${encodeURIComponent(member.id)}`) as Parameters<
        typeof router.push
      >[0],
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
    setRolePickerOpen(false);
  };

  const handleToggleSelect = (member: OrgMember) => {
    setSelectedIds((prev) =>
      prev.includes(member.id)
        ? prev.filter((id) => id !== member.id)
        : [...prev, member.id],
    );
  };

  const handleBulkAssignRole = async (platformRole: PlatformTeamRole) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const label =
      TEAM_INVITE_ROLE_OPTIONS.find((o) => o.value === platformRole)?.label ??
      platformRole;

    const confirmed = await confirmDialog({
      title: "Change role?",
      message: `Set ${ids.length} member${ids.length === 1 ? "" : "s"} to ${label}? This replaces their current permissions.`,
      confirmLabel: "Apply",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setBulkBusy(true);
    try {
      const permissions = buildTeamInvitePermissions(platformRole, undefined, orgCaps);
      const { error, updated } = await updateBulkMemberPermissions(
        ids,
        platformRole,
        permissions,
      );
      if (error) {
        Alert.alert("Could not change roles", error.message);
        return;
      }
      invalidate();
      await query.refetch();
      exitSelectMode();
      Alert.alert("Roles updated", `${updated} member${updated === 1 ? "" : "s"} set to ${label}.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const roster = query.data;
  const all = roster?.members ?? [];
  const pendingPhoneInvites = roster?.pendingPhoneInvites ?? [];
  const activeMembers = useMemo(() => all.filter((m) => m.status === "active"), [all]);
  const pendingMembers = useMemo(() => all.filter((m) => m.status === "pending"), [all]);
  const pendingCount = pendingMembers.length + pendingPhoneInvites.length;

  type PendingGridItem =
    | { kind: "member"; member: OrgMember }
    | { kind: "phone"; invite: PendingPhoneTeamInvite };

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

  const pendingItems = useMemo<PendingGridItem[]>(() => {
    const q = search.trim().toLowerCase();
    const phoneItems: PendingGridItem[] = pendingPhoneInvites
      .filter((invite) => {
        if (!q) return true;
        return (
          invite.invitee_name.toLowerCase().includes(q) ||
          invite.invitee_phone.toLowerCase().includes(q) ||
          (invite.invitee_email ?? "").toLowerCase().includes(q)
        );
      })
      .map((invite) => ({ kind: "phone" as const, invite }));
    const memberItems: PendingGridItem[] = applySearch(pendingMembers).map(
      (member) => ({ kind: "member" as const, member }),
    );
    return [...phoneItems, ...memberItems];
  }, [pendingPhoneInvites, pendingMembers, search]);

  const displayList = applySearch(tab === "members" ? activeMembers : pendingMembers);

  const onRefresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const handleCancelPhoneInvite = async (invite: PendingPhoneTeamInvite) => {
    const confirmed = await confirmDialog({
      title: "Cancel invitation?",
      message: `Remove the invite for ${invite.invitee_name}? They will not be added when they sign up.`,
      confirmLabel: "Cancel invite",
      cancelLabel: "Keep",
      destructive: true,
    });
    if (!confirmed) return;

    setActionId(invite.id);
    try {
      const { error } = await cancelTeamInvite(invite.id, "phone_pending");
      if (error) {
        Alert.alert("Error", error.message);
        return;
      }
      invalidate();
      await query.refetch();
    } finally {
      setActionId(null);
    }
  };

  if (query.isLoading && !query.data) {
    return (
      <View style={styles.centered}>
        <LoadingIndicator color={Theme.loaderAccent} />
      </View>
    );
  }

  const numColumns = desktopMetronic ? 3 : 2;
  const memberRows: OrgMember[][] = [];
  for (let i = 0; i < displayList.length; i += numColumns) {
    memberRows.push(displayList.slice(i, i + numColumns));
  }

  const pendingRows: PendingGridItem[][] = [];
  for (let i = 0; i < pendingItems.length; i += numColumns) {
    pendingRows.push(pendingItems.slice(i, i + numColumns));
  }

  const body = (
    <>
      <DomainJoinRequestsPanel orgId={orgId} canManage={canManage} />

      <View
        style={[
          styles.tabRow,
          desktopMetronic && styles.tabRowMetronic,
          embedded && styles.tabRowEmbedded,
        ]}
      >
        {(["members", "pending"] as const).map((k) => {
          const on = tab === k;
          const count = k === "members" ? activeMembers.length : pendingCount;
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

      {canManage && tab === "members" && activeMembers.length > 1 ? (
        <View style={[styles.bulkToggleRow, embedded && styles.bulkToggleRowEmbedded]}>
          <Pressable
            onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            style={({ pressed }) => [
              styles.bulkToggleBtn,
              selectMode && styles.bulkToggleBtnOn,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={selectMode ? "Exit multi-select" : "Select multiple members"}
          >
            {selectMode ? (
              <X size={12} color={Theme.textOnPrimary} strokeWidth={2.4} />
            ) : (
              <CheckSquare size={12} color={Theme.primary} strokeWidth={2.2} />
            )}
            <Text
              style={[
                styles.bulkToggleText,
                selectMode && styles.bulkToggleTextOn,
              ]}
            >
              {selectMode ? "Done" : "Select"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {tab === "members" ? (
        displayList.length === 0 ? (
          <EmptyMembers onInvite={canManage ? onInvite : undefined} />
        ) : (
          <View style={[styles.grid, embedded && styles.gridEmbedded]}>
            {memberRows.map((row, ri) => (
              <View key={`row-${ri}`} style={styles.gridRow}>
                {row.map((m) => (
                  <View key={m.id} style={styles.gridCell}>
                    {actionId === m.id ? (
                      <View style={[styles.gridCell, styles.busyCard]}>
                        <LoadingIndicator color={Theme.loaderAccent} />
                      </View>
                    ) : (
                      <MemberCard
                        member={m}
                        isCurrentUser={m.user_id === currentUserId}
                        canManage={canManage}
                        onEdit={handleEditMember}
                        selectable={selectMode}
                        selected={selectedIds.includes(m.id)}
                        onToggleSelect={handleToggleSelect}
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
        )
      ) : pendingItems.length === 0 ? (
        <EmptyPending onInvite={canManage ? onInvite : undefined} />
      ) : (
        <View style={[styles.grid, embedded && styles.gridEmbedded]}>
          {pendingRows.map((row, ri) => (
            <View key={`pending-row-${ri}`} style={styles.gridRow}>
              {row.map((item) => (
                <View
                  key={item.kind === "phone" ? item.invite.id : item.member.id}
                  style={styles.gridCell}
                >
                  {actionId === (item.kind === "phone" ? item.invite.id : item.member.id) ? (
                    <View style={[styles.gridCell, styles.busyCard]}>
                      <LoadingIndicator color={Theme.loaderAccent} />
                    </View>
                  ) : item.kind === "phone" ? (
                    <PendingPhoneInviteCard
                      invite={item.invite}
                      canManage={canManage}
                      onCancel={handleCancelPhoneInvite}
                    />
                  ) : (
                    <MemberCard
                      member={item.member}
                      isCurrentUser={item.member.user_id === currentUserId}
                      canManage={canManage}
                      onEdit={handleEditMember}
                    />
                  )}
                </View>
              ))}
              {row.length < numColumns
                ? Array.from({ length: numColumns - row.length }).map((_, i) => (
                    <View key={`pending-spacer-${ri}-${i}`} style={styles.gridCell} />
                  ))
                : null}
            </View>
          ))}
        </View>
      )}

      {all.length > 0 || pendingPhoneInvites.length > 0 ? (
        <View style={[styles.statsRow, embedded && styles.statsRowEmbedded]}>
          <View style={styles.statChip}>
            <UserCheck size={11} color={Theme.darkGreen} strokeWidth={2.2} />
            <Text style={styles.statText}>{activeMembers.length} active</Text>
          </View>
          {pendingCount > 0 ? (
            <View style={styles.statChip}>
              <UserMinus size={11} color={Theme.warning} strokeWidth={2.2} />
              <Text style={[styles.statText, { color: Theme.warning }]}>
                {pendingCount} pending
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const bulkBar =
    selectMode && selectedIds.length > 1 ? (
      <View style={styles.bulkBar}>
        {rolePickerOpen ? (
          <View style={styles.rolePicker}>
            <Text style={styles.rolePickerTitle}>
              Apply to {selectedIds.length} members
            </Text>
            <View style={styles.rolePickerRow}>
              {TEAM_INVITE_ROLE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleBulkAssignRole(option.value)}
                  disabled={bulkBusy}
                  style={({ pressed }) => [
                    styles.rolePickerChip,
                    pressed && { opacity: 0.85 },
                    bulkBusy && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.rolePickerChipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.bulkBarMain}>
          <Text style={styles.bulkBarCount}>
            {selectedIds.length} selected
          </Text>
          <View style={styles.bulkBarActions}>
            <Pressable
              onPress={exitSelectMode}
              disabled={bulkBusy}
              style={({ pressed }) => [
                styles.bulkClearBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
            >
              <Text style={styles.bulkClearBtnText}>Clear</Text>
            </Pressable>
            <Pressable
              onPress={() => setRolePickerOpen((o) => !o)}
              disabled={bulkBusy}
              style={({ pressed }) => [
                styles.bulkPrimaryBtn,
                pressed && { opacity: 0.88 },
                bulkBusy && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Change role for selected members"
            >
              {bulkBusy ? (
                <LoadingIndicator size="small" color={Theme.textOnPrimary} />
              ) : (
                <>
                  <Shield size={12} color={Theme.textOnPrimary} strokeWidth={2.4} />
                  <Text style={styles.bulkPrimaryBtnText}>Change role</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    ) : null;

  if (embedded) {
    return (
      <View style={styles.embeddedRoot}>
        {body}
        {bulkBar}
      </View>
    );
  }

  return (
    <View style={styles.scroll}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          bulkBar ? styles.contentWithBulkBar : null,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.loaderAccent} />
        }
      >
        {body}
      </ScrollView>
      {bulkBar}
    </View>
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
  tabOn: { borderBottomColor: Theme.accentGold },
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
  tabBadgeOn: { backgroundColor: Theme.accentGold },
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
  gridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  gridCell: {
    flex: 1,
    minWidth: 0,
    ...Platform.select({
      web: {
        display: "flex" as const,
        flexDirection: "column" as const,
        alignSelf: "stretch" as const,
      },
    }),
  },
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
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  emptyInviteBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
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
  contentWithBulkBar: { paddingBottom: 120 },

  bulkToggleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  bulkToggleRowEmbedded: { paddingHorizontal: 20 },
  bulkToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  bulkToggleBtnOn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  bulkToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  bulkToggleTextOn: { color: Theme.textOnPrimary },

  bulkBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: "hidden",
  },
  bulkBarMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bulkBarCount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  bulkBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bulkClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
  },
  bulkClearBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  bulkPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 112,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Theme.primary,
  },
  bulkPrimaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  rolePicker: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  rolePickerTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  rolePickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 8,
  },
  rolePickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  rolePickerChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
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
