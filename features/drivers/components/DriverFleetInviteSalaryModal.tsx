/**
 * Collect salary / pay terms before sending an in-app fleet invitation.
 * Responsive: bottom sheet on phones, centered card on desktop web.
 */
import { partyAddModalChromeStyles } from '@/components/PartyAddModalChrome';
import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DriverInviteCompensation } from '../utils/driverInviteCompensation.util';
import {
  hasDriverInviteCompensation,
  normalizeDriverInviteCompensation,
  validateDriverInviteCompensation,
} from '../utils/driverInviteCompensation.util';

export type DriverFleetInviteSalaryModalMode = 'fleet_reinvite' | 'signup_match';

type Props = {
  visible: boolean;
  mode: DriverFleetInviteSalaryModalMode;
  driverName: string;
  initialCompensation: DriverInviteCompensation;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (compensation: DriverInviteCompensation) => void | Promise<void>;
};

function CompensationPreview({
  compensation,
}: {
  compensation: DriverInviteCompensation;
}) {
  const normalized = normalizeDriverInviteCompensation(compensation);
  if (!hasDriverInviteCompensation(normalized)) return null;

  const rows: { label: string; value: string }[] = [];
  if (normalized.payableAmount != null) {
    rows.push({
      label: 'Fixed salary',
      value: `₹${normalized.payableAmount.toLocaleString('en-IN')}/mo`,
    });
  }
  if (normalized.commissionPercent != null) {
    rows.push({
      label: 'Commission',
      value: `${normalized.commissionPercent}%`,
    });
  }
  if (normalized.commissionPerKm != null) {
    rows.push({
      label: 'Per km',
      value: `₹${normalized.commissionPerKm.toLocaleString('en-IN')}/km`,
    });
  }

  return (
    <View style={styles.previewCard}>
      <Text style={styles.previewTitle}>Driver will see in app</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.previewRow}>
          <Text style={styles.previewLabel}>{row.label}</Text>
          <Text style={styles.previewValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function DriverFleetInviteSalaryModal({
  visible,
  mode,
  driverName,
  initialCompensation,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width >= 768;
  const isCompact = width < 400;
  const [compensation, setCompensation] =
    useState<DriverInviteCompensation>(initialCompensation);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCompensation(initialCompensation);
      setError(null);
    }
  }, [visible, initialCompensation]);

  const copy = useMemo(() => {
    if (mode === 'fleet_reinvite') {
      return {
        title: 'Reconnect driver',
        subtitle: `${driverName} left your fleet. Set pay terms — they appear in the driver app invite popup.`,
        note: 'Required every time you reconnect a driver.',
      };
    }
    return {
      title: 'Send invitation',
      subtitle: `Set pay terms for ${driverName}. Shown in the driver app before they accept.`,
      note: 'At least one pay term is required.',
    };
  }, [driverName, mode]);

  const handleSubmit = async () => {
    const validationError = validateDriverInviteCompensation(compensation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    await onSubmit(compensation);
  };

  if (!visible) return null;

  const shellMaxW = Math.min(440, Math.max(300, width - 32));
  const shellMaxH = Math.min(height * 0.9, 640);

  const renderField = (
    label: string,
    placeholder: string,
    value: string,
    onChangeText: (v: string) => void,
    options?: { flex?: number },
  ) => (
    <View style={[styles.fieldWrap, options?.flex != null ? { flex: options.flex } : null]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Theme.placeholder}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        editable={!submitting}
      />
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <View
          style={[
            styles.overlay,
            isWebDesktop ? styles.overlayDesktop : styles.overlayMobile,
          ]}
        >
          <Pressable
            style={partyAddModalChromeStyles.overlayDismissHit}
            onPress={submitting ? undefined : onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View
            style={[
              styles.shell,
              isWebDesktop ? styles.shellDesktop : styles.shellMobile,
              {
                maxWidth: shellMaxW,
                maxHeight: shellMaxH,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>

            <View style={styles.header}>
              <View style={styles.headerMain}>
                <View style={styles.headerIcon}>
                  <FontAwesome name="money" size={15} color={Theme.primary} />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.title}>{copy.title}</Text>
                  <Text style={styles.subtitle}>{copy.subtitle}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                disabled={submitting}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Close"
              >
                <FontAwesome name="times" size={18} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.noteCard}>
              <FontAwesome name="info-circle" size={13} color={Theme.primary} />
              <Text style={styles.noteText}>{copy.note}</Text>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderField(
                'Fixed salary (₹ / month)',
                'e.g. 25000',
                compensation.payableAmount != null && compensation.payableAmount !== 0
                  ? String(compensation.payableAmount)
                  : '',
                (v) => {
                  const n =
                    v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                  setCompensation((p) => ({
                    ...p,
                    payableAmount:
                      n != null && !Number.isNaN(n) && n > 0 ? n : null,
                  }));
                  setError(null);
                },
              )}

              <View
                style={[
                  styles.splitRow,
                  isCompact && styles.splitRowStacked,
                ]}
              >
                {renderField(
                  'Trip commission (%)',
                  'e.g. 10',
                  compensation.commissionPercent != null &&
                    compensation.commissionPercent !== 0
                    ? String(compensation.commissionPercent)
                    : '',
                  (v) => {
                    const n =
                      v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                    const val =
                      n != null && !Number.isNaN(n)
                        ? Math.min(100, Math.max(0, n))
                        : null;
                    setCompensation((p) => ({
                      ...p,
                      commissionPercent: val != null && val > 0 ? val : null,
                    }));
                    setError(null);
                  },
                  { flex: 1 },
                )}
                {renderField(
                  'Per km (₹/km)',
                  'e.g. 8',
                  compensation.commissionPerKm != null &&
                    compensation.commissionPerKm !== 0
                    ? String(compensation.commissionPerKm)
                    : '',
                  (v) => {
                    const n =
                      v.trim() === '' ? null : parseFloat(v.replace(/[^0-9.]/g, ''));
                    setCompensation((p) => ({
                      ...p,
                      commissionPerKm:
                        n != null && !Number.isNaN(n) && n > 0 ? n : null,
                    }));
                    setError(null);
                  },
                  { flex: 1 },
                )}
              </View>

              <CompensationPreview compensation={compensation} />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </ScrollView>

            <View style={[styles.footer, isCompact && styles.footerStacked]}>
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  isCompact && styles.footerBtnFull,
                  submitting && styles.btnDisabled,
                ]}
                onPress={onClose}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  isCompact && styles.footerBtnFull,
                  submitting && styles.btnDisabled,
                ]}
                onPress={() => void handleSubmit()}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <>
                    <FontAwesome name="send" size={13} color={Theme.textOnPrimary} />
                    <Text style={styles.submitBtnText}>Send invitation</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor:
      Platform.OS === 'web'
        ? 'rgba(15, 23, 42, 0.52)'
        : 'rgba(15, 23, 42, 0.55)',
    paddingHorizontal: 16,
  },
  overlayDesktop: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayMobile: {
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  shell: {
    backgroundColor: Theme.surface,
    overflow: 'hidden',
    zIndex: 1,
    width: '100%',
    ...(Platform.OS === 'web'
      ? {
          boxShadow:
            '0 24px 64px -16px rgba(15,23,42,0.28), 0 1px 0 rgba(255,255,255,0.9)',
        }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
          elevation: 16,
        }),
  },
  shellDesktop: {
    borderRadius: 20,
    maxHeight: '88%',
  },
  shellMobile: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minWidth: 0,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.pulseIndigoWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Theme.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.screenBackground,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: Theme.screenBackground,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textSecondary,
    fontWeight: '500',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  fieldWrap: {
    marginBottom: 12,
    minWidth: 0,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  splitRowStacked: {
    flexDirection: 'column',
    gap: 0,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 11 : 10,
    fontSize: 16,
    color: Theme.text,
    backgroundColor: Theme.surface,
  },
  previewCard: {
    marginTop: 4,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
  },
  previewTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  previewLabel: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.text,
  },
  errorText: {
    marginTop: 4,
    fontSize: 13,
    color: Theme.negative,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  footerStacked: {
    flexDirection: 'column-reverse',
  },
  footerBtnFull: {
    width: '100%',
    flex: undefined,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  submitBtn: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textOnPrimary,
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
