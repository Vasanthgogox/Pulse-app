import { LoadingIndicator } from '@/components/LoadingIndicator';
import Theme from '@/constants/Theme';
import {
  REGISTRATION_TYPE_OPTIONS,
  registrationTypeLabel,
} from '@/features/organization/utils/kycVerification.util';
import {
  GREEN,
  GREEN_TINT,
  PURPLE,
} from '@/features/organization/components/workspace/workspacePanelUi';
import type { RegistrationType, WorkspaceKyc } from '@/types/organization';
import { Check, CircleDashed, Pencil } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type RegistrationProps = {
  kyc: WorkspaceKyc | null;
  canEdit: boolean;
  frozen: boolean;
  onSave: (type: RegistrationType) => Promise<{ error: Error | null }>;
};

export function KycRegistrationTypeRow({ kyc, canEdit, frozen, onSave }: RegistrationProps) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<RegistrationType | null>(kyc?.registration_type ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(kyc?.registration_type ?? null);
  }, [kyc?.registration_type]);

  const filled = !!selected;
  const statusBg = filled ? GREEN_TINT : Theme.surfaceGray;

  const handleSave = async (type: RegistrationType) => {
    setSaving(true);
    try {
      const { error } = await onSave(type);
      if (!error) {
        setSelected(type);
        setExpanded(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: statusBg }]}>
          {filled ? (
            <Check size={12} color={GREEN} strokeWidth={2.8} />
          ) : (
            <CircleDashed size={12} color={Theme.textMuted} strokeWidth={2} />
          )}
        </View>
        <View style={styles.main}>
          <Text style={styles.label}>Registration type</Text>
          <Text style={styles.hint}>Legal structure of your business</Text>
        </View>
        <View style={styles.trailing}>
          <Text style={[styles.value, !filled && styles.valueEmpty]}>
            {filled ? registrationTypeLabel(selected) : 'Not selected'}
          </Text>
          {canEdit && !frozen ? (
            <Pressable style={styles.editBtn} onPress={() => setExpanded((v) => !v)}>
              <Pencil size={10} color={PURPLE} strokeWidth={2.2} />
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {expanded && canEdit && !frozen ? (
        <View style={styles.editor}>
          <View style={styles.chipRow}>
            {REGISTRATION_TYPE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.chip, selected === opt.value && styles.chipOn]}
                disabled={saving}
                onPress={() => void handleSave(opt.value)}
              >
                <Text style={[styles.chipText, selected === opt.value && styles.chipTextOn]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {saving ? <LoadingIndicator size="small" color={Theme.primary} /> : null}
        </View>
      ) : null}
    </View>
  );
}

type AddressProps = {
  kyc: WorkspaceKyc | null;
  canEdit: boolean;
  frozen: boolean;
  onSave: (input: {
    address_line: string;
    city: string;
    state: string;
    address_pincode: string;
  }) => Promise<{ error: Error | null }>;
};

export function KycOperatingAddressRow({ kyc, canEdit, frozen, onSave }: AddressProps) {
  const [expanded, setExpanded] = useState(false);
  const [addressLine, setAddressLine] = useState(kyc?.address_line ?? '');
  const [city, setCity] = useState(kyc?.city ?? '');
  const [state, setStateVal] = useState(kyc?.state ?? '');
  const [pincode, setPincode] = useState(kyc?.address_pincode ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAddressLine(kyc?.address_line ?? '');
    setCity(kyc?.city ?? '');
    setStateVal(kyc?.state ?? '');
    setPincode(kyc?.address_pincode ?? '');
  }, [kyc?.address_line, kyc?.city, kyc?.state, kyc?.address_pincode]);

  const filled = !!(addressLine.trim() && city.trim() && state.trim());
  const summary = filled
    ? [city, state].filter(Boolean).join(', ')
    : 'Not filled';
  const statusBg = filled ? GREEN_TINT : Theme.surfaceGray;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await onSave({
        address_line: addressLine,
        city,
        state: state,
        address_pincode: pincode,
      });
      if (!error) setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: statusBg }]}>
          {filled ? (
            <Check size={12} color={GREEN} strokeWidth={2.8} />
          ) : (
            <CircleDashed size={12} color={Theme.textMuted} strokeWidth={2} />
          )}
        </View>
        <View style={styles.main}>
          <Text style={styles.label}>Operating address</Text>
          <Text style={styles.hint}>Registered business address</Text>
        </View>
        <View style={styles.trailing}>
          <Text style={[styles.value, !filled && styles.valueEmpty]} numberOfLines={1}>
            {summary}
          </Text>
          {canEdit && !frozen ? (
            <Pressable style={styles.editBtn} onPress={() => setExpanded((v) => !v)}>
              <Pencil size={10} color={PURPLE} strokeWidth={2.2} />
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {expanded && canEdit && !frozen ? (
        <View style={styles.editor}>
          <TextInput
            style={styles.input}
            value={addressLine}
            onChangeText={setAddressLine}
            placeholder="Address line"
            placeholderTextColor={Theme.textMuted}
          />
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputHalf]}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={Theme.textMuted}
            />
            <TextInput
              style={[styles.input, styles.inputHalf]}
              value={state}
              onChangeText={setStateVal}
              placeholder="State"
              placeholderTextColor={Theme.textMuted}
            />
          </View>
          <TextInput
            style={styles.input}
            value={pincode}
            onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="Pincode"
            placeholderTextColor={Theme.textMuted}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            disabled={saving || !addressLine.trim() || !city.trim() || !state.trim()}
            onPress={() => void handleSave()}
          >
            {saving ? (
              <LoadingIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save address</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type WebsiteProps = {
  website: string;
  canEdit: boolean;
  frozen: boolean;
  onSave: (website: string) => Promise<{ error: Error | null }>;
};

export function KycWebsiteRow({ website, canEdit, frozen, onSave }: WebsiteProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(website);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(website), [website]);

  const filled = !!website.trim();
  const statusBg = filled ? GREEN_TINT : Theme.surfaceGray;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await onSave(draft);
      if (!error) setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: statusBg }]}>
          {filled ? (
            <Check size={12} color={GREEN} strokeWidth={2.8} />
          ) : (
            <CircleDashed size={12} color={Theme.textMuted} strokeWidth={2} />
          )}
        </View>
        <View style={styles.main}>
          <Text style={styles.label}>Website</Text>
          <Text style={styles.hint}>Public company website (optional)</Text>
        </View>
        <View style={styles.trailing}>
          <Text style={[styles.value, !filled && styles.valueEmpty]} numberOfLines={1}>
            {filled ? website : 'Not filled'}
          </Text>
          {canEdit && !frozen ? (
            <Pressable style={styles.editBtn} onPress={() => setExpanded((v) => !v)}>
              <Pencil size={10} color={PURPLE} strokeWidth={2.2} />
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {expanded && canEdit && !frozen ? (
        <View style={styles.editor}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="https://example.com"
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Pressable
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            disabled={saving}
            onPress={() => void handleSave()}
          >
            {saving ? (
              <LoadingIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save website</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  main: { flex: 1, minWidth: 0, gap: 1 },
  label: { fontSize: 12, fontWeight: '600', color: Theme.textPrimaryDark },
  hint: { fontSize: 10, color: Theme.textMuted, lineHeight: 13 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0, maxWidth: '46%' },
  value: { fontSize: 11, fontWeight: '500', color: Theme.textPrimaryDark, textAlign: 'right' },
  valueEmpty: { color: Theme.textMuted, fontWeight: '400' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  editBtnText: { fontSize: 10, fontWeight: '600', color: PURPLE },
  editor: { marginLeft: 38, gap: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  chipOn: { borderColor: Theme.primary, backgroundColor: 'rgba(59,130,246,0.06)' },
  chipText: { fontSize: 10, fontWeight: '500', color: Theme.textSecondary },
  chipTextOn: { color: Theme.primary, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.screenBackground,
    minHeight: 34,
  },
  inputRow: { flexDirection: 'row', gap: 8 },
  inputHalf: { flex: 1, minWidth: 0 },
  saveBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: PURPLE,
    minHeight: 30,
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 11, fontWeight: '600', color: '#fff', textAlign: 'center' },
  btnDisabled: { opacity: 0.5 },
});
