/**
 * My Account — workspace flex-card panel.
 *
 * Mirrors the standardised workspace detail chrome (white header chip, soft
 * canvas body, sticky footer when needed) so the page lives inside the same
 * 40vw side card as Settings / Team / KYC instead of opening as a full screen.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { WorkspacePanelId } from "@/features/organization/components/workspace/workspacePanelTypes";
import { ROUTES } from "@/lib/routes";
import {
  Building2,
  ChevronRight,
  Lock,
  MessageSquare,
  Pencil,
  ScanLine,
  Settings2,
  Shield,
  Sparkles,
  Users,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  textWrap: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  value: { fontSize: 14, fontWeight: "600", color: Theme.textPrimaryDark },
  lockBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
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
  },
});

function ManagementRow({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [mgmtStyles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={mgmtStyles.icon}>{icon}</View>
      <Text style={mgmtStyles.label}>{label}</Text>
      <ChevronRight size={13} color={Theme.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

const mgmtStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  icon: { width: 28, alignItems: "center" },
  label: { flex: 1, fontSize: 12, fontWeight: "600", color: Theme.textPrimaryDark },
});

export function WorkspaceAccountPanel({
  onBack,
  onEdit,
  onOpenPanel,
  onOpenRoute,
}: Props) {
  const { profile, user, status } = useAuth();

  const isLoading = status === "restoring";

  const fullName = profile?.full_name ?? profile?.displayName ?? "";
  const phone = profile?.phone ?? "";
  const email = user?.email ?? profile?.email ?? "";
  const company = profile?.company_name ?? "";

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
              label="Registered Company"
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
              and invoices. Manage it in Workspace settings.
            </Text>
          </View>
        </View>
      </View>

      {(onOpenPanel || onOpenRoute) ? (
        <View style={styles.card}>
          <SectionHeader label="Workspace Management" />
          {onOpenPanel ? (
            <>
              <ManagementRow
                label="Workspace settings"
                icon={<Building2 size={15} color={PURPLE} strokeWidth={1.8} />}
                onPress={() => onOpenPanel("settings")}
              />
              <ManagementRow
                label="Org identity & KYC"
                icon={<Settings2 size={15} color={PURPLE} strokeWidth={1.8} />}
                onPress={() => onOpenPanel("kyc")}
              />
              <ManagementRow
                label="Pulse Scan usage"
                icon={<ScanLine size={15} color={PURPLE} strokeWidth={1.8} />}
                onPress={() => onOpenPanel("ocr-usage")}
              />
            </>
          ) : null}
          {onOpenRoute ? (
            <>
              <ManagementRow
                label="Team members"
                icon={<Users size={15} color={PURPLE} strokeWidth={1.8} />}
                onPress={() => onOpenRoute(ROUTES.MODALS.TEAM)}
              />
              <ManagementRow
                label="Business Pulse intelligence"
                icon={<Sparkles size={15} color={PURPLE} strokeWidth={1.8} />}
                onPress={() => onOpenRoute(ROUTES.BUSINESS_PULSE)}
              />
            </>
          ) : null}
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
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    marginTop: 1,
  },
  identityText: { flex: 1 },
  identityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 3,
  },
  identityBody: { fontSize: 12, color: Theme.textSecondary, lineHeight: 17 },
});
