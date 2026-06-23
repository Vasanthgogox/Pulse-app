/**
 * Add / edit workspace location (Network Details tab).
 */
import Theme from '@/constants/Theme';
import type {
  CreateOrganizationLocationData,
  OrganizationLocationType,
  OrganizationWorkspaceLocation,
} from '@/features/organization/services/organizationLocations.service';
import {
  createOrganizationLocation,
  deleteOrganizationLocation,
  updateOrganizationLocation,
} from '@/features/organization/services/organizationLocations.service';
import { useInvalidateOrganizationLocations } from '@/lib/queries/useOrganizationLocationsQuery';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

const LOCATION_TYPES: { value: OrganizationLocationType; label: string }[] = [
  { value: 'registered_office', label: 'Registered office' },
  { value: 'branch_office', label: 'Branch office' },
  { value: 'primary_hub', label: 'Primary hub' },
  { value: 'regional_office', label: 'Regional office' },
  { value: 'dispatch_center', label: 'Dispatch center' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'other', label: 'Other' },
];

type Props = {
  visible: boolean;
  orgId: string;
  orgName: string;
  location: OrganizationWorkspaceLocation | null;
  initialDraft?: Partial<CreateOrganizationLocationData>;
  onClose: () => void;
};

export function NetworkDesktopLocationModal({
  visible,
  orgId,
  orgName,
  location,
  initialDraft,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateOrganizationLocations();
  const isEdit = Boolean(location?.id);

  const [name, setName] = useState('');
  const [locationType, setLocationType] = useState<OrganizationLocationType>('primary_hub');
  const [department, setDepartment] = useState('Operations & dispatch');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (location) {
      setName(location.name);
      setLocationType(location.location_type);
      setDepartment(location.department ?? 'Operations & dispatch');
      setAddressLine(location.address_line ?? '');
      setCity(location.city ?? '');
      setState(location.state ?? '');
      setIsVerified(location.is_verified);
      return;
    }
    setName(initialDraft?.name ?? `${orgName} hub`);
    setLocationType(initialDraft?.location_type ?? 'registered_office');
    setDepartment(initialDraft?.department ?? 'Operations & dispatch');
    setAddressLine(initialDraft?.address_line ?? '');
    setCity(initialDraft?.city ?? '');
    setState(initialDraft?.state ?? '');
    setIsVerified(initialDraft?.is_verified ?? false);
  }, [visible, location, initialDraft, orgName]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Location name is required');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: trimmedName,
      location_type: locationType,
      department,
      address_line: addressLine,
      city,
      state,
      is_verified: isVerified,
    };
    const result = isEdit
      ? await updateOrganizationLocation(location!.id, payload)
      : await createOrganizationLocation(orgId, payload);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    invalidate(orgId);
    onClose();
  }, [
    addressLine,
    city,
    department,
    invalidate,
    isEdit,
    isVerified,
    location,
    locationType,
    name,
    onClose,
    orgId,
    state,
  ]);

  const handleDelete = useCallback(() => {
    if (!location) return;
    Alert.alert('Remove location', `Delete "${location.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          const { error: delErr } = await deleteOrganizationLocation(location.id);
          setSaving(false);
          if (delErr) {
            setError(delErr.message);
            return;
          }
          invalidate(orgId);
          onClose();
        },
      },
    ]);
  }, [invalidate, location, onClose, orgId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16 },
            Platform.OS === 'web' ? ({ cursor: 'default' } as ViewStyle) : null,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>
              {isEdit ? 'Location details' : 'Offer location'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <X size={18} color={Theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Mumbai dispatch center"
              placeholderTextColor={Theme.textMuted}
            />

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {LOCATION_TYPES.map((opt) => {
                const active = locationType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setLocationType(opt.value)}
                  >
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Department</Text>
            <TextInput
              style={styles.input}
              value={department}
              onChangeText={setDepartment}
              placeholder="Operations & dispatch"
              placeholderTextColor={Theme.textMuted}
            />

            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={addressLine}
              onChangeText={setAddressLine}
              placeholder="Street / building"
              placeholderTextColor={Theme.textMuted}
              multiline
            />

            <View style={styles.row}>
              <View style={styles.rowField}>
                <Text style={styles.label}>City</Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
              <View style={styles.rowField}>
                <Text style={styles.label}>State</Text>
                <TextInput
                  style={styles.input}
                  value={state}
                  onChangeText={setState}
                  placeholder="State"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
            </View>

            <Pressable
              style={styles.verifyRow}
              onPress={() => setIsVerified((v) => !v)}
            >
              <View style={[styles.checkbox, isVerified && styles.checkboxOn]}>
                {isVerified ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.verifyLabel}>Mark as verified workspace</Text>
            </Pressable>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            {isEdit ? (
              <Pressable
                style={styles.deleteBtn}
                onPress={handleDelete}
                disabled={saving}
              >
                <Text style={styles.deleteBtnText}>Remove</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View style={styles.footerActions}>
              <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={() => void handleSave()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Theme.textOnPrimary} size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>{isEdit ? 'Save' : 'Add location'}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  body: {
    maxHeight: 420,
  },
  bodyContent: {
    padding: 20,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textSecondary,
    marginTop: 10,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.screenBackground,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  typeChipActive: {
    borderColor: Theme.primary,
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  typeChipTextActive: {
    color: Theme.primary,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowField: {
    flex: 1,
    minWidth: 0,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },
  checkmark: {
    color: Theme.textOnPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  verifyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: Theme.negative,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 'auto',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    minWidth: 110,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Theme.buttonPrimaryText,
  },
  deleteBtn: {
    paddingVertical: 10,
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.negative,
  },
});
