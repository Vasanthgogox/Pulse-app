/**
 * Access Control — owner-only surface to manage every member's role & access.
 *
 * Reuses TeamMembersView (roster, role edit, remove, transfer ownership) but
 * gates management on the org OWNER (not any non-driver, as the shared Team
 * screen does). The DB is the real authority: role writes go through the
 * owner-only set_member_role RPC and org_members_update RLS blocks off-RPC role
 * changes — this screen is the convenience surface on top of that.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { TeamMembersView } from "@/features/organization/components/TeamMembersView";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { ROUTES } from "@/lib/routes";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, ClipboardList, ShieldCheck, UserPlus2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AccessControlScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { isOwner, isLoading } = useOrgRole();
  const { can: canSurface } = useMemberAccess();

  const orgId = currentOrganization?.id ?? null;
  const canInvite = isOwner && canSurface("team.invite");
  const canViewAudit = canSurface("team.audit");

  const handleOpenAuditLog = () => {
    router.push(ROUTES.AUDIT_LOG as Href);
  };

  const handleInvite = () => {
    router.push(ROUTES.MODALS.INVITE_MEMBER as Parameters<typeof router.push>[0]);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(ROUTES.TABS.PROFILE as Parameters<typeof router.replace>[0]);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
          <ChevronLeft size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerIconWrap}>
            <ShieldCheck size={16} color={Theme.primary} strokeWidth={2.2} />
          </View>
          <Text style={styles.headerTitle}>Access Control</Text>
          {currentOrganization?.name ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {currentOrganization.name}
            </Text>
          ) : null}
        </View>
        {canInvite ? (
          <Pressable
            onPress={handleInvite}
            style={({ pressed }) => [styles.inviteBtn, pressed && { opacity: 0.8 }]}
          >
            <UserPlus2 size={16} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
            <Text style={styles.inviteBtnText}>Invite</Text>
          </Pressable>
        ) : (
          <View style={styles.inviteBtnPlaceholder} />
        )}
      </View>

      {canViewAudit && isOwner ? (
        <Pressable
          onPress={handleOpenAuditLog}
          style={({ pressed }) => [styles.auditLinkRow, pressed && { opacity: 0.8 }]}
        >
          <ClipboardList size={16} color={Theme.textSecondary} strokeWidth={2.2} />
          <Text style={styles.auditLinkText}>View audit trail</Text>
          <ChevronRight size={16} color={Theme.textMuted} strokeWidth={2.2} />
        </Pressable>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <LoadingIndicator color={Theme.loaderAccent} />
        </View>
      ) : !isOwner ? (
        <View style={styles.centered}>
          <ShieldCheck size={36} color={Theme.textSection} strokeWidth={1.5} />
          <Text style={styles.noAccessText}>Owner access only</Text>
          <Text style={styles.noAccessSub}>
            Only the organization owner can manage member roles and access.
          </Text>
        </View>
      ) : !orgId ? (
        <View style={styles.centered}>
          <ShieldCheck size={36} color={Theme.textSection} strokeWidth={1.5} />
          <Text style={styles.noAccessText}>No organization loaded</Text>
          <Text style={styles.noAccessSub}>Sign out and sign in again to refresh.</Text>
        </View>
      ) : (
        <TeamMembersView
          orgId={orgId}
          currentUserId={user?.uid ?? null}
          canManage={isOwner}
          onInvite={canInvite ? handleInvite : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  headerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(79,70,229,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 10,
    color: Theme.textMuted,
    letterSpacing: 0.1,
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  inviteBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  inviteBtnPlaceholder: { width: 38 },
  auditLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  auditLinkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  noAccessText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textSecondary,
    marginTop: 8,
  },
  noAccessSub: {
    fontSize: 13,
    color: Theme.textMuted,
    textAlign: "center",
  },
});
