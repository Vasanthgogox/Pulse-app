import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  permissionLabel,
  platformRoleFromMember,
  TEAM_INVITE_ROLE_OPTIONS,
  type PlatformTeamRole,
} from "@/features/organization/utils/teamInviteRoles.util";
import type { OrgMember } from "@/types/organization";
import { ArrowRightLeft, Check, Pencil, Shield, Trash2, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  member: OrgMember | null;
  saving?: boolean;
  desktopMetronic?: boolean;
  /** Owner-only: reveal the "Transfer ownership" action for this member. */
  canTransfer?: boolean;
  onClose: () => void;
  onSave: (member: OrgMember, role: PlatformTeamRole) => void;
  onRemove: (member: OrgMember) => void;
  onTransfer?: (member: OrgMember) => void;
};

function RoleOption({
  option,
  selected,
  onSelect,
}: {
  option: (typeof TEAM_INVITE_ROLE_OPTIONS)[0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.roleRow,
        selected && styles.roleRowSelected,
        pressed && { opacity: 0.88 },
      ]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.roleCopy}>
        <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>
          {option.label}
        </Text>
        <Text style={styles.roleDesc}>{option.description}</Text>
      </View>
      {selected ? <Check size={16} color={Theme.primary} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

function PermissionsPanel({ role }: { role: PlatformTeamRole }) {
  const option = TEAM_INVITE_ROLE_OPTIONS.find((o) => o.value === role);
  if (!option) return null;
  return (
    <View style={styles.permPanel}>
      <Text style={styles.permTitle}>Permissions included</Text>
      <View style={styles.permChips}>
        {option.grants.map((grant) => (
          <View key={grant} style={styles.permChip}>
            <Check size={10} color={Theme.darkGreen} strokeWidth={2.8} />
            <Text style={styles.permChipText}>{permissionLabel(grant)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MemberEditModal({
  visible,
  member,
  saving = false,
  desktopMetronic = false,
  canTransfer = false,
  onClose,
  onSave,
  onRemove,
  onTransfer,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selectedRole, setSelectedRole] = useState<PlatformTeamRole>("operator");

  useEffect(() => {
    if (!member) return;
    setSelectedRole(platformRoleFromMember(member) ?? "operator");
  }, [member]);

  if (!member) return null;

  const displayName = member.full_name || member.phone || member.email || "Team member";
  const currentRole = platformRoleFromMember(member) ?? "operator";
  const unchanged = selectedRole === currentRole;
  const centered = desktopMetronic || Platform.OS === "web";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, centered && styles.backdropCentered]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            centered && styles.cardCentered,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Pencil size={14} color={Theme.primary} strokeWidth={2.2} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Edit member</Text>
              <Text style={styles.subtitle}>Role & permissions</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <X size={16} color={Theme.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.memberStrip}>
            <PartyAvatar
              name={displayName}
              avatarUrl={member.avatar_url ?? null}
              entityType="client"
              size={44}
              borderStyle={styles.avatarBorder}
            />
            <View style={styles.memberMeta}>
              <Text style={styles.memberName} numberOfLines={1}>
                {displayName}
              </Text>
              {member.phone ? (
                <Text style={styles.memberPhone} numberOfLines={1}>
                  {member.phone}
                </Text>
              ) : null}
              {member.email ? (
                <Text style={styles.memberEmail} numberOfLines={1}>
                  {member.email}
                </Text>
              ) : null}
            </View>
            <View style={styles.currentRolePill}>
              <Shield size={10} color={Theme.primary} strokeWidth={2.2} />
              <Text style={styles.currentRoleText}>
                {member.status === "invited" ? "PENDING" : "ACTIVE"}
              </Text>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>Workspace role</Text>
            {TEAM_INVITE_ROLE_OPTIONS.map((option) => (
              <RoleOption
                key={option.value}
                option={option}
                selected={selectedRole === option.value}
                onSelect={() => setSelectedRole(option.value)}
              />
            ))}
            <PermissionsPanel role={selectedRole} />

            {canTransfer && member.status === "active" ? (
              <Pressable
                onPress={() => onTransfer?.(member)}
                disabled={saving}
                style={({ pressed }) => [
                  styles.transferRow,
                  pressed && !saving && { opacity: 0.88 },
                  saving && styles.btnDisabled,
                ]}
              >
                <View style={styles.transferIcon}>
                  <ArrowRightLeft size={14} color={Theme.warning} strokeWidth={2.2} />
                </View>
                <View style={styles.transferCopy}>
                  <Text style={styles.transferTitle}>Transfer ownership</Text>
                  <Text style={styles.transferDesc}>
                    Make {displayName} the owner. You&apos;ll become an admin.
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={() => onRemove(member)}
              disabled={saving}
              style={({ pressed }) => [
                styles.removeBtn,
                pressed && { opacity: 0.75 },
                saving && styles.btnDisabled,
              ]}
            >
              <Trash2 size={13} color={Theme.destructive} strokeWidth={2.2} />
              <Text style={styles.removeBtnText}>
                {member.status === "invited" ? "Cancel invite" : "Remove member"}
              </Text>
            </Pressable>

            <View style={styles.footerActions}>
              <Pressable
                onPress={onClose}
                disabled={saving}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => onSave(member, selectedRole)}
                disabled={saving || unchanged}
                style={({ pressed }) => [
                  styles.saveBtn,
                  (saving || unchanged) && styles.btnDisabled,
                  pressed && !saving && !unchanged && { opacity: 0.9 },
                ]}
              >
                {saving ? (
                  <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
                ) : (
                  <Text style={styles.saveBtnText}>Save changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.48)",
    justifyContent: "flex-end",
  },
  backdropCentered: {
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
    paddingTop: 16,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  cardCentered: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(59,130,246,0.15)",
  },
  headerText: { flex: 1, gap: 1 },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  memberStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    marginBottom: 12,
  },
  avatarBorder: {
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  memberMeta: { flex: 1, minWidth: 0, gap: 1 },
  memberName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  memberPhone: {
    fontSize: 11,
    color: Theme.textSecondary,
  },
  memberEmail: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  currentRolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  currentRoleText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.3,
  },
  scroll: { maxHeight: 340 },
  scrollContent: { paddingBottom: 8, gap: 8 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  roleRowSelected: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(59,130,246,0.04)",
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioSelected: { borderColor: Theme.primary },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.primary,
  },
  roleCopy: { flex: 1, gap: 2 },
  roleLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  roleLabelSelected: { color: Theme.primary },
  roleDesc: {
    fontSize: 11,
    color: Theme.textMuted,
    lineHeight: 15,
  },
  permPanel: {
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    gap: 8,
  },
  permTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  permChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  permChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMuted,
    maxWidth: "100%",
  },
  permChipText: {
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 14,
    flexShrink: 1,
  },
  transferRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    padding: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.warning,
    backgroundColor: Theme.warningMuted,
  },
  transferIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  transferCopy: { flex: 1, gap: 2 },
  transferTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.warning,
  },
  transferDesc: {
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 10,
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  removeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.destructive,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    minHeight: 40,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    minHeight: 40,
    minWidth: 128,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  btnDisabled: { opacity: 0.45 },
});
