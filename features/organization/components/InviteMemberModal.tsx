/**
 * Invite team member modal: phone lookup → role selection → confirm.
 * Matches AddDriverModal / AddClientModal patterns.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  lookupUserByPhone,
  inviteTeamMember,
} from "@/features/organization/services/members.service";
import type { OrgMemberRole, UserProfileForInvite } from "@/types/organization";
import {
  Check,
  ChevronLeft,
  Phone,
  Search,
  Shield,
  User,
  UserPlus2,
  X,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  METRONIC,
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type InviteMemberLayout = "modal" | "embedded";

// ─── Role option ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: OrgMemberRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Can invite and manage team members, edit org settings" },
  { value: "member", label: "Member", description: "Can access and use org resources" },
];

function RoleOption({
  option,
  selected,
  onSelect,
}: {
  option: (typeof ROLE_OPTIONS)[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [roleStyles.row, selected && roleStyles.rowSelected, pressed && { opacity: 0.85 }]}
    >
      <View style={[roleStyles.radio, selected && roleStyles.radioSelected]}>
        {selected && <View style={roleStyles.radioDot} />}
      </View>
      <View style={roleStyles.labelWrap}>
        <Text style={[roleStyles.label, selected && roleStyles.labelSelected]}>
          {option.label}
        </Text>
        <Text style={roleStyles.desc}>{option.description}</Text>
      </View>
      {selected && <Check size={16} color={Theme.primary} strokeWidth={2.5} />}
    </Pressable>
  );
}

const roleStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.screenBackground,
    marginBottom: 10,
  },
  rowSelected: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.03)",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: Theme.primary },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.primary,
  },
  labelWrap: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: "600", color: Theme.textPrimaryDark },
  labelSelected: { color: Theme.primary },
  desc: { fontSize: 12, color: Theme.textMuted, marginTop: 2, lineHeight: 16 },
});

// ─── User preview card ────────────────────────────────────────────────────────

function UserPreviewCard({ profile }: { profile: UserProfileForInvite }) {
  const displayName = profile.full_name || profile.phone || profile.email || "Unknown";
  return (
    <View style={previewStyles.card}>
      <PartyAvatar
        name={displayName.toUpperCase()}
        avatarUrl={profile.avatar_url}
        entityType="client"
        size={48}
      />
      <View style={previewStyles.info}>
        <Text style={previewStyles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {!!profile.phone && (
          <Text style={previewStyles.sub} numberOfLines={1}>
            {profile.phone}
          </Text>
        )}
        {!!profile.email && !profile.phone && (
          <Text style={previewStyles.sub} numberOfLines={1}>
            {profile.email}
          </Text>
        )}
      </View>
      <View style={previewStyles.foundBadge}>
        <Check size={11} color={Theme.darkGreen} strokeWidth={2.8} />
        <Text style={previewStyles.foundBadgeText}>Found</Text>
      </View>
    </View>
  );
}

const previewStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.positiveMuted,
    backgroundColor: "rgba(21,128,61,0.03)",
    marginBottom: 20,
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  sub: { fontSize: 12, color: Theme.textMuted, marginTop: 2 },
  foundBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Theme.positiveMuted,
  },
  foundBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
});

// ─── Main modal ────────────────────────────────────────────────────────────────

type Step = "phone" | "role";

export interface InviteMemberFlowProps {
  orgId: string;
  onClose: () => void;
  onInvited: () => void;
  layout?: InviteMemberLayout;
}

export function InviteMemberFlow({
  orgId,
  onClose,
  onInvited,
  layout = "modal",
}: InviteMemberFlowProps) {
  const embedded = layout === "embedded";
  const insets = useSafeAreaInsets();
  const ui = embedded ? embeddedFlow : modal;
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundProfile, setFoundProfile] = useState<UserProfileForInvite | null>(null);
  const [selectedRole, setSelectedRole] = useState<OrgMemberRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSearch = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setSearchError("Please enter a phone number.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setFoundProfile(null);

    const { error, profile } = await lookupUserByPhone(trimmed);
    setSearching(false);

    if (error) {
      setSearchError(error.message);
      return;
    }
    if (!profile) {
      setSearchError(
        "No user found with that phone number. They need to sign up with Pulse first.",
      );
      return;
    }
    setFoundProfile(profile);
    setStep("role");
  };

  const handleInvite = async () => {
    if (!foundProfile) return;
    setSubmitting(true);
    setSubmitError(null);

    const { error, member, alreadyMember, alreadyInvited } = await inviteTeamMember(
      orgId,
      foundProfile.user_id,
      selectedRole,
    );

    setSubmitting(false);

    if (alreadyMember) {
      setSubmitError("This person is already an active member of your team.");
      return;
    }
    if (alreadyInvited) {
      setSubmitError("An invitation has already been sent to this person.");
      return;
    }
    if (error) {
      setSubmitError(error.message);
      return;
    }
    if (member) {
      setSuccess(true);
      setTimeout(() => {
        onInvited();
      }, embedded ? 600 : 900);
    }
  };

  const goBack = () => {
    if (step === "role") {
      setStep("phone");
      setFoundProfile(null);
      setSubmitError(null);
    } else {
      onClose();
    }
  };

  const stepContent = (
    <>
      {success ? (
        <View style={ui.successWrap}>
          <View style={ui.successCircle}>
            <Check size={embedded ? 22 : 28} color={Theme.textOnPrimary} strokeWidth={2.8} />
          </View>
          <Text style={ui.successTitle}>Invitation sent</Text>
          <Text style={ui.successSub}>
            {foundProfile?.full_name || foundProfile?.phone} has been invited as{" "}
            <Text style={{ fontWeight: "700" }}>
              {selectedRole === "admin" ? "Admin" : "Member"}
            </Text>
            . They'll need to accept the invite to access the org.
          </Text>
        </View>
      ) : step === "phone" ? (
        <>
          <View style={ui.sectionHeader}>
            <Phone size={16} color={Theme.textSecondary} strokeWidth={2} />
            <Text style={ui.sectionTitle}>Phone number</Text>
          </View>
          <Text style={ui.sectionDesc}>
            Enter the phone number of the person you'd like to invite. They must already
            have a Q account.
          </Text>

          <View style={ui.inputWrap}>
            <TextInput
              style={ui.input}
              placeholder="+91 98765 43210"
              placeholderTextColor={Theme.textMuted}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                setSearchError(null);
              }}
              keyboardType="phone-pad"
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              autoFocus={!embedded}
            />
          </View>

          {!!searchError && (
            <View style={ui.errorRow}>
              <X size={13} color={Theme.destructive} strokeWidth={2.5} />
              <Text style={ui.errorText}>{searchError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSearch}
            disabled={searching}
            style={({ pressed }) => [
              ui.primaryBtn,
              embedded && hubStyles.teamInviteBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            {searching ? (
              <LoadingIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <>
                <Search size={16} color={Theme.textOnPrimary} strokeWidth={2.4} />
                <Text style={[ui.primaryBtnText, embedded && hubStyles.teamInviteBtnText]}>
                  Search
                </Text>
              </>
            )}
          </Pressable>
        </>
      ) : (
        <>
          {foundProfile && <UserPreviewCard profile={foundProfile} />}

          <View style={ui.sectionHeader}>
            <Shield size={16} color={Theme.textSecondary} strokeWidth={2} />
            <Text style={ui.sectionTitle}>Access role</Text>
          </View>
          <Text style={[ui.sectionDesc, { marginBottom: 14 }]}>
            Choose what level of access this person should have in your organisation.
          </Text>

          {ROLE_OPTIONS.map((opt) => (
            <RoleOption
              key={opt.value}
              option={opt}
              selected={selectedRole === opt.value}
              onSelect={() => setSelectedRole(opt.value)}
            />
          ))}

          {!!submitError && (
            <View style={ui.errorRow}>
              <X size={13} color={Theme.destructive} strokeWidth={2.5} />
              <Text style={ui.errorText}>{submitError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleInvite}
            disabled={submitting}
            style={({ pressed }) => [
              ui.primaryBtn,
              { marginTop: 8 },
              embedded && hubStyles.teamInviteBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <LoadingIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <>
                <UserPlus2 size={16} color={Theme.textOnPrimary} strokeWidth={2.4} />
                <Text style={[ui.primaryBtnText, embedded && hubStyles.teamInviteBtnText]}>
                  Send invitation
                </Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <View style={embeddedFlow.root}>
        <View style={embeddedFlow.stepRow}>
          {(["phone", "role"] as const).map((s, i) => {
            const done = (step === "role" && s === "phone") || success;
            const active = step === s;
            return (
              <React.Fragment key={s}>
                <View
                  style={[
                    embeddedFlow.stepDot,
                    active && embeddedFlow.stepDotActive,
                    done && embeddedFlow.stepDotDone,
                  ]}
                >
                  {done ? (
                    <Check size={10} color={Theme.textOnPrimary} strokeWidth={3} />
                  ) : (
                    <Text
                      style={[embeddedFlow.stepNum, active && embeddedFlow.stepNumActive]}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                {i < 1 ? (
                  <View
                    style={[
                      embeddedFlow.stepLine,
                      (active || done) && { backgroundColor: METRONIC.link },
                    ]}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>

        {step === "role" && !success ? (
          <Pressable
            onPress={goBack}
            style={embeddedFlow.backLink}
            accessibilityRole="button"
            accessibilityLabel="Back to phone search"
          >
            <ChevronLeft size={14} color={METRONIC.link} strokeWidth={2.4} />
            <Text style={embeddedFlow.backLinkText}>Back to phone search</Text>
          </Pressable>
        ) : null}

        <ScrollView
          style={embeddedFlow.scroll}
          contentContainerStyle={embeddedFlow.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {stepContent}
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={[modal.safe, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={modal.header}>
        <Pressable onPress={goBack} style={modal.backBtn} hitSlop={8}>
          <ChevronLeft size={22} color={Theme.textPrimaryDark} strokeWidth={2.5} />
        </Pressable>
        <View style={modal.headerCenter}>
          <Text style={modal.headerTitle}>
            {step === "phone" ? "Invite Team Member" : "Set Role"}
          </Text>
          <Text style={modal.headerSub}>
            {step === "phone" ? "Find by phone number" : "Choose their access level"}
          </Text>
        </View>
        <Pressable onPress={onClose} style={modal.closeBtn} hitSlop={8}>
          <X size={20} color={Theme.textSecondary} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Step indicator */}
      <View style={modal.stepRow}>
        {(["phone", "role"] as const).map((s, i) => {
          const done = (step === "role" && s === "phone") || success;
          const active = step === s;
          return (
            <React.Fragment key={s}>
              <View style={[modal.stepDot, active && modal.stepDotActive, done && modal.stepDotDone]}>
                {done ? (
                  <Check size={10} color={Theme.textOnPrimary} strokeWidth={3} />
                ) : (
                  <Text style={[modal.stepNum, active && modal.stepNumActive]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              {i < 1 && (
                <View style={[modal.stepLine, (active || done) && { backgroundColor: Theme.primary }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={modal.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {stepContent}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function InviteMemberModal(props: InviteMemberFlowProps) {
  return <InviteMemberFlow {...props} layout="modal" />;
}

const embeddedFlow = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    minHeight: 320,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    paddingBottom: 8,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 14,
    gap: 0,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F5F8FA",
    borderWidth: 2,
    borderColor: METRONIC.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: METRONIC.link,
    borderColor: METRONIC.link,
  },
  stepDotDone: {
    backgroundColor: METRONIC.heroRing,
    borderColor: METRONIC.heroRing,
  },
  stepNum: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.muted,
  },
  stepNumActive: {
    color: Theme.textOnPrimary,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: METRONIC.border,
    marginHorizontal: 4,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  backLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.link,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: 0.1,
  },
  sectionDesc: {
    fontSize: 12,
    color: METRONIC.muted,
    lineHeight: 17,
    marginBottom: 14,
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
    marginBottom: 12,
  },
  input: {
    fontSize: 15,
    color: METRONIC.text,
    fontWeight: "500",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginBottom: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(232,33,39,0.06)",
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: Theme.destructive,
    lineHeight: 17,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
    minWidth: 140,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  successWrap: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  successCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: METRONIC.heroRing,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: METRONIC.text,
  },
  successSub: {
    fontSize: 13,
    color: METRONIC.muted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 320,
  },
});

const modal = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  headerSub: { fontSize: 11, color: Theme.textMuted, marginTop: 1 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 0,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  stepDotDone: {
    backgroundColor: Theme.darkGreen,
    borderColor: Theme.darkGreen,
  },
  stepNum: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  stepNumActive: { color: Theme.textOnPrimary },
  stepLine: {
    width: 48,
    height: 2,
    backgroundColor: Theme.borderMedium,
    marginHorizontal: 4,
  },

  body: { padding: 20, paddingBottom: 40 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  sectionDesc: {
    fontSize: 13,
    color: Theme.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },

  inputWrap: {
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Theme.surface,
    marginBottom: 12,
  },
  input: {
    fontSize: 16,
    color: Theme.textPrimaryDark,
    fontWeight: "500",
  },

  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(232,33,39,0.06)",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Theme.destructive,
    lineHeight: 18,
  },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: Theme.primary,
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.1,
  },

  successWrap: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Theme.darkGreen,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  successSub: {
    fontSize: 14,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
});
