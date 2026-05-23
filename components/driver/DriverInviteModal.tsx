import Theme from '@/constants/Theme';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import type { DriverInviteRow } from '@/features/drivers/services/drivers.service';
import { buildDriverInviteSalaryLines } from '@/lib/driverInviteOffer.util';
import { getFleetAvatarUriForOrg } from '@/lib/fleetAvatar';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  invite: DriverInviteRow;
  queueIndex?: number;
  queueTotal?: number;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onLater: () => void;
};

export function DriverInviteModal({
  visible,
  invite,
  queueIndex = 1,
  queueTotal = 1,
  busy = false,
  onAccept,
  onDecline,
  onLater,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useDriverThemeColors();
  const { avatarUri } = useDriverAvatarUri();

  const orgLogo =
    invite.from_org_logo_url ?? invite.from_org_avatar_url ?? avatarUri ?? null;
  const presetFleetUri = getFleetAvatarUriForOrg(
    invite.from_organization_id ?? '',
    invite.from_org_name ?? '',
  );
  const salaryLines = buildDriverInviteSalaryLines(invite);
  const orgName = invite.from_org_name?.trim() || 'Fleet organisation';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onLater}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.backdrop, Platform.OS === 'web' ? styles.backdropWeb : null]}
        onPress={onLater}
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {queueTotal > 1 ? (
            <Text style={[styles.queueLabel, { color: colors.textMuted }]}>
              Invitation {queueIndex} of {queueTotal}
            </Text>
          ) : null}

          <View style={styles.header}>
            <View style={[styles.avatarWrap, { borderColor: colors.border }]}>
              <Image
                source={{ uri: orgLogo ?? presetFleetUri }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.kicker, { color: colors.emerald }]}>Fleet invitation</Text>
              <Text style={[styles.orgName, { color: colors.text }]} numberOfLines={2}>
                {orgName}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Review pay terms and connect to receive trip assignments.
              </Text>
            </View>
          </View>

          <View style={[styles.previewCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>Salary and pay preview</Text>
            {salaryLines.length > 0 ? (
              <ScrollView style={styles.previewScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {salaryLines.map((line) => (
                  <View key={line.label} style={[styles.previewRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.previewRowLeft}>
                      <Text style={[styles.previewLabel, { color: colors.textMuted }]}>{line.label}</Text>
                      <Text style={[styles.previewHint, { color: colors.textMuted }]}>{line.hint}</Text>
                    </View>
                    <Text style={[styles.previewValue, { color: colors.text }]}>{line.value}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.previewEmpty}>
                <FontAwesome name="info-circle" size={14} color={colors.textMuted} />
                <Text style={[styles.previewEmptyText, { color: colors.textMuted }]}>
                  Pay terms will be confirmed when you accept. You can view details in Requests after connecting.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.declineBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              onPress={onDecline}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={[styles.declineText, { color: colors.textMuted }]}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: colors.emerald }, busy && styles.disabled]}
              onPress={onAccept}
              disabled={busy}
              activeOpacity={0.88}
            >
              {busy ? (
                <ActivityIndicator size="small" color={Theme.textOnPrimary} />
              ) : (
                <>
                  <FontAwesome name="check" size={13} color={Theme.textOnPrimary} />
                  <Text style={styles.acceptText}>Accept invite</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onLater} disabled={busy} style={styles.laterBtn} activeOpacity={0.7}>
            <Text style={[styles.laterText, { color: colors.textMuted }]}>View later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  backdropWeb: {
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '88%',
  },
  handleRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
  },
  queueLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  orgName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    maxHeight: 220,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  previewScroll: {
    maxHeight: 160,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewRowLeft: {
    flex: 1,
    minWidth: 0,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  previewHint: {
    fontSize: 11,
    lineHeight: 15,
  },
  previewValue: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  previewEmpty: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  previewEmptyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  declineBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    fontSize: 13,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 1.4,
    minHeight: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  acceptText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  laterBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  laterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.65,
  },
});
