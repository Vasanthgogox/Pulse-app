/**
 * My Account — workspace flex-card panel.
 *
 * Mirrors the standardised workspace detail chrome (white header chip, soft
 * canvas body, sticky footer when needed) so the page lives inside the same
 * 40vw side card as Settings / Team / KYC instead of opening as a full screen.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { platformRoleLabel } from "@/features/organization/utils/teamInviteRoles.util";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import { useWorkspaceOrgLogo } from "@/features/organization/hooks/useWorkspaceOrgLogo";
import {
  modelLabel,
  orgInitials,
} from "@/features/organization/components/workspace/workspacePanelUi";
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { orgHubStatusCopy } from "@/features/organization/components/workspace/org/organizationHub.util";
import { getOrgVerificationBannerFields } from "@/features/organization/services/organization.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { WorkspacePanelId } from "@/features/organization/components/workspace/workspacePanelTypes";
import { useOrgRole } from "@/lib/hooks/useOrgRole";
import { LOCALE_OPTIONS } from "@/lib/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useCapabilities } from "@/lib/useCapabilities";
import {
  WORKSPACE_REGION_LABELS,
  getWorkspaceRegion,
} from "@/lib/workspaceRegion";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronRight,
  Globe,
  HelpCircle,
  Lock,
  MapPin,
  MessageSquare,
  Pencil,
  Shield,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

const PURPLE = "#4D3636";
const PURPLE_TINT = "rgba(79,70,229,0.08)";
const PURPLE_BORDER = "rgba(79,70,229,0.18)";
const TEAL = "#0f766e";
const TEAL_TINT = "rgba(15,118,110,0.08)";
const AMBER = "#d97706";
const AMBER_TINT = "rgba(217,119,6,0.08)";

type Props = {
  onBack: () => void;
  onEdit: () => void;
  onOpenPanel?: (panel: WorkspacePanelId) => void;
  onOpenRoute?: (path: string) => void;
};

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.accent} />
      <Text style={sh.title}>{label}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  accent: { width: 3, height: 14, borderRadius: 2, backgroundColor: PURPLE },
  title: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
});

function IdentityRow({
  icon,
  iconBg,
  label,
  value,
  locked,
  onPress,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  value: string;
  locked?: boolean;
  onPress?: () => void;
}) {
  const inner = (
    <View style={rowStyles.wrap}>
      <View style={[rowStyles.iconBox, iconBg ? { backgroundColor: iconBg } : null]}>
        {icon}
      </View>
      <View style={rowStyles.textWrap}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={rowStyles.value} numberOfLines={1}>
          {value || "—"}
        </Text>
      </View>
      {locked ? (
        <View style={rowStyles.lockBadge}>
          <Lock size={10} color={Theme.textMuted} strokeWidth={2.2} />
        </View>
      ) : onPress ? (
        <View style={rowStyles.editBadge}>
          <Pencil size={10} color={PURPLE} strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
        onPress={onPress}
        accessibilityRole="button"
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    flexShrink: 0,
  },
  textWrap: { flex: 1, minWidth: 0, justifyContent: "center" },
  label: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimary,
    lineHeight: 16,
  },
  lockBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  editBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: PURPLE_TINT,
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});

function ManagementRow({
  label,
  icon,
  onPress,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [mgmtStyles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={mgmtStyles.iconBox}>{icon}</View>
      <Text style={mgmtStyles.label}>{label}</Text>
      {value ? <Text style={mgmtStyles.value}>{value}</Text> : null}
      <ChevronRight size={13} color={Theme.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

const mgmtStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    flexShrink: 0,
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimary,
  },
  value: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    maxWidth: 120,
    flexShrink: 0,
  },
});

export function WorkspaceAccountPanel({
  onBack,
  onEdit,
  onOpenPanel,
  onOpenRoute,
}: Props) {
  const { profile, user, status } = useAuth();
  const { currentOrganization } = useOrganization();
  const { logoUri } = useWorkspaceOrgLogo();
  const { role } = useOrgRole();
  const capabilities = useCapabilities();
  const { locale } = useLanguage();
  const [regionLabel, setRegionLabel] = useState(WORKSPACE_REGION_LABELS.india);

  const isLoading = status === "restoring";
  const orgId = currentOrganization?.id ?? "";

  const { data: verificationStatus } = useQuery({
    queryKey: queryKeys.workspace.verificationBanner(orgId),
    queryFn: async () => {
      const { fields, error } = await getOrgVerificationBannerFields(orgId);
      if (error) throw error;
      return fields?.verification_status ?? "unverified";
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  useEffect(() => {
    let mounted = true;
    void getWorkspaceRegion().then((region) => {
      if (mounted) setRegionLabel(WORKSPACE_REGION_LABELS[region]);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const fullName = profile?.full_name ?? profile?.displayName ?? "";
  const phone = profile?.phone ?? "";
  const email = user?.email ?? profile?.email ?? "";
  const company = profile?.company_name ?? "";
  const orgName = currentOrganization?.name?.trim() || company || "Organization";
  const orgModel = modelLabel(currentOrganization?.operatingModel);
  const orgInitialsLabel = orgInitials(orgName);
  const languageLabel =
    LOCALE_OPTIONS.find((o) => o.value === locale)?.label ?? "English";
  const roleLabel =
    role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";
  // "Member" alone doesn't say what the member can actually do — surface the
  // assigned functional role (Finance / Sales / Trip Ops / Restricted) so
  // someone like a Trip-Ops-only member can see their own scope here instead
  // of having to ask an admin. Redundant for owner/admin (they already read
  // "Owner"/"Admin" above) so only shown for non-owner/admin.
  //
  // organization_members.role is OrgMemberRole, which includes legacy values
  // 'dispatcher' | 'finance' | 'driver' | 'member' — all four map to the
  // generic "Member" roleLabel above (same as this file already treated
  // them). A role === "member" check here only matched the literal string
  // and silently never fired for the 'dispatcher' rows this org's actual
  // Trip Ops members are stored as — confirmed live (Ayush is
  // organization_members.role = 'dispatcher', permissions.platformRole =
  // 'tripops'). Must check "not owner/admin", not "is exactly member".
  const { memberPlatformRole } = useOptionalActiveWorkspace() ?? {};
  const functionalRoleLabel =
    role !== "owner" && role !== "admin" && memberPlatformRole
      ? platformRoleLabel(memberPlatformRole)
      : null;
  const hasOperationalAccess =
    capabilities.includes("finance_view") ||
    capabilities.includes("finance_manage") ||
    capabilities.includes("dispatch") ||
    capabilities.includes("dispatch_for_own_fleet");
  const accessLabel = hasOperationalAccess
    ? "Operational access"
    : "Limited access";
  const verificationCopy = orgHubStatusCopy(verificationStatus ?? "unverified");

  const openOrganization = () => {
    if (onOpenPanel) onOpenPanel("profile");
    else if (onOpenRoute) onOpenRoute(ROUTES.WORKSPACE_ORGANIZATION);
  };

  const editButton = (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [styles.editChip, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel="Edit profile"
      hitSlop={6}
    >
      <Pencil size={14} color={PURPLE} strokeWidth={2.4} />
    </Pressable>
  );

  if (isLoading) {
    return (
      <WorkspaceDetailLayout
        title={WORKSPACE_PANEL_TITLES.account}
        subtitle={WORKSPACE_PANEL_SUBTITLES.account}
        onBack={onBack}
        fillBody
      >
        <View style={styles.loadingScreen}>
          <LoadingIndicator size="small" color={Theme.primary} />
        </View>
      </WorkspaceDetailLayout>
    );
  }

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.account}
      subtitle={WORKSPACE_PANEL_SUBTITLES.account}
      onBack={onBack}
      rightSlot={editButton}
    >
      {/* Hero card */}
      <View style={styles.heroCard}>
        <View style={styles.heroAvatarWrap}>
          <PartyAvatar
            name={fullName.trim() || "User"}
            avatarUrl={profile?.avatar_url ?? null}
            avatarSeed={profile?.avatar_seed ?? null}
            size={84}
            borderStyle={{ borderWidth: 3, borderColor: "#ffffff" }}
          />
          <Pressable
            style={styles.heroCameraBtn}
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            hitSlop={6}
          >
            <FontAwesome name="camera" size={10} color="#ffffff" />
          </Pressable>
        </View>
        <Text style={styles.heroName} numberOfLines={1}>
          {fullName || "No name set"}
        </Text>
        {profile?.status_text ? (
          <Text style={styles.heroStatus} numberOfLines={1}>
            {profile.status_text}
          </Text>
        ) : null}
        <View style={styles.roleBadge}>
          <Shield size={10} color={PURPLE} strokeWidth={2.5} />
          <Text style={styles.roleBadgeText}>PERSONAL ACCOUNT</Text>
        </View>
      </View>

      {/* Personal identity */}
      <View style={styles.card}>
        <SectionHeader label="Personal Identity" />
        <IdentityRow
          icon={<FontAwesome name="user" size={14} color={PURPLE} />}
          iconBg={PURPLE_TINT}
          label="Full Name"
          value={fullName}
          onPress={onEdit}
        />
        <View style={styles.divider} />
        <IdentityRow
          icon={<FontAwesome name="phone" size={14} color={TEAL} />}
          iconBg={TEAL_TINT}
          label="Mobile"
          value={phone}
          locked
        />
        <View style={styles.divider} />
        <IdentityRow
          icon={<FontAwesome name="envelope" size={13} color={AMBER} />}
          iconBg={AMBER_TINT}
          label="Email"
          value={email}
          locked
        />
        {company ? (
          <>
            <View style={styles.divider} />
            <IdentityRow
              icon={<Building2 size={14} color={PURPLE} strokeWidth={2.2} />}
              iconBg={PURPLE_TINT}
              label="Company (signup)"
              value={company}
              locked
            />
          </>
        ) : null}
        <View style={styles.lockedNote}>
          <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
          <Text style={styles.lockedNoteText}>
            Phone, email and company are set at signup and cannot be changed here.
          </Text>
        </View>
      </View>

      {/* How identity works */}
      <View style={styles.card}>
        <SectionHeader label="How your identity works" />
        <View style={styles.identityRow}>
          <View style={[styles.identityIconBox, { backgroundColor: "rgba(99,102,241,0.1)" }]}>
            <MessageSquare size={14} color="#4D3636" strokeWidth={2.2} />
          </View>
          <View style={styles.identityText}>
            <Text style={styles.identityTitle}>Chat & team communications</Text>
            <Text style={styles.identityBody}>
              Your personal photo and name appear in trip chats and team messages.
            </Text>
          </View>
        </View>
        <View style={styles.identityDivider} />
        <View style={styles.identityRow}>
          <View style={[styles.identityIconBox, { backgroundColor: TEAL_TINT }]}>
            <Building2 size={14} color={TEAL} strokeWidth={2.2} />
          </View>
          <View style={styles.identityText}>
            <Text style={styles.identityTitle}>Network & partner visibility</Text>
            <Text style={styles.identityBody}>
              Your org logo represents the business on the load board, partner profiles
              and invoices. Manage it in Organization.
            </Text>
          </View>
        </View>
      </View>

      {currentOrganization ? (
        <Pressable
          style={({ pressed }) => [styles.orgCard, pressed && { opacity: 0.9 }]}
          onPress={openOrganization}
          accessibilityRole="button"
          accessibilityLabel="Open organization"
        >
          <View style={styles.orgCardHeader}>
            <View style={styles.orgCardAccent} />
            <Text style={styles.orgCardEyebrow}>My Workspaces</Text>
          </View>
          <View style={styles.orgCardRow}>
            <View style={styles.orgCardLogoWrap}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.orgCardLogo} />
              ) : (
                <Text style={styles.orgCardLogoInitials}>{orgInitialsLabel}</Text>
              )}
            </View>
            <View style={styles.orgCardInfo}>
              <View style={styles.orgCardNameRow}>
                <Text style={styles.orgCardName} numberOfLines={1}>
                  {orgName}
                </Text>
                <View style={styles.orgCardBadge}>
                  <Text style={styles.orgCardBadgeText}>{orgModel}</Text>
                </View>
              </View>
              <Text style={styles.orgCardMeta} numberOfLines={1}>
                {functionalRoleLabel
                  ? `${roleLabel} · ${functionalRoleLabel} · ${accessLabel}`
                  : `${roleLabel} · ${accessLabel}`}
              </Text>
            </View>
            <ChevronRight size={13} color={Theme.textMuted} strokeWidth={2} />
          </View>
          <Text style={styles.orgCardCaption}>
            {verificationCopy.kicker}
            {verificationCopy.body ? ` · ${verificationCopy.body}` : ""}
          </Text>
        </Pressable>
      ) : null}

      {onOpenPanel ? (
        <View style={styles.card}>
          <SectionHeader label="Preferences" />
          <ManagementRow
            label="Language"
            icon={<Globe size={15} color={PURPLE} strokeWidth={1.8} />}
            value={languageLabel}
            onPress={() => onOpenPanel("language")}
          />
          <ManagementRow
            label="Region"
            icon={<MapPin size={15} color={PURPLE} strokeWidth={1.8} />}
            value={regionLabel}
            onPress={() => onOpenPanel("region")}
          />
        </View>
      ) : null}

      {onOpenRoute ? (
        <View style={styles.card}>
          <SectionHeader label="Support" />
          <ManagementRow
            label="Support"
            icon={<HelpCircle size={15} color={PURPLE} strokeWidth={1.8} />}
            onPress={() => onOpenRoute(ROUTES.CHAT)}
          />
        </View>
      ) : null}

    </WorkspaceDetailLayout>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center" },
  editChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PURPLE_TINT,
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
  },
  heroCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 18,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  heroAvatarWrap: { position: "relative", width: 88, height: 88, marginBottom: 4 },
  heroCameraBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  heroName: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  heroStatus: {
    fontSize: 12,
    color: Theme.textSecondary,
    textAlign: "center",
    maxWidth: 240,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PURPLE_TINT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
    marginTop: 4,
  },
  roleBadgeText: { fontSize: 9, fontWeight: "900", color: PURPLE, letterSpacing: 1.6 },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginLeft: 60,
  },
  lockedNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  lockedNoteText: {
    fontSize: 10,
    color: Theme.textMuted,
    flex: 1,
    lineHeight: 14,
  },
  orgCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  orgCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  orgCardAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: PURPLE,
  },
  orgCardEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  orgCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  orgCardLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  orgCardLogo: {
    width: 34,
    height: 34,
  },
  orgCardLogoInitials: {
    fontSize: 11,
    fontWeight: "800",
    color: PURPLE,
    letterSpacing: 0.4,
  },
  orgCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  orgCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orgCardName: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    flex: 1,
    minWidth: 0,
  },
  orgCardBadge: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    flexShrink: 0,
  },
  orgCardBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: PURPLE,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  orgCardMeta: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 1,
  },
  orgCardCaption: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  identityDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginLeft: 60,
  },
  identityIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  identityText: { flex: 1, minWidth: 0, justifyContent: "center" },
  identityTitle: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  identityBody: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
});
