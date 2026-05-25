/**
 * Shared workspace panel UI primitives.
 */
import { LoadingIndicator } from '@/components/LoadingIndicator';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import type { WorkspaceKyc } from '@/types/organization';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock,
  Copy,
  Lock,
  Pencil,
} from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export const PURPLE = '#1a237e';
export const PURPLE_MID = '#312e81';
export const PURPLE_TINT = 'rgba(26,35,126,0.08)';
export const PURPLE_BORDER = 'rgba(26,35,126,0.18)';
export const TEAL = '#0f766e';
export const TEAL_TINT = 'rgba(15,118,110,0.08)';
export const AMBER = '#d97706';
export const AMBER_TINT = 'rgba(217,119,6,0.08)';
export const GREEN = '#16a34a';
export const GREEN_TINT = 'rgba(22,163,74,0.08)';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0]![0] ?? '').toUpperCase();
  return ((words[0]![0] ?? '') + (words[words.length - 1]![0] ?? '')).toUpperCase();
}

export function modelLabel(m: string | undefined): string {
  switch (m) {
    case 'ASSET_BASED': return 'Asset-based';
    case 'NON_ASSET': return 'Non-asset';
    case 'HYBRID': return 'Hybrid';
    default: return 'Hybrid';
  }
}

export function modelColor(m: string | undefined): string {
  switch (m) {
    case 'ASSET_BASED': return TEAL;
    case 'NON_ASSET': return AMBER;
    default: return PURPLE;
  }
}

export type KycField = 'gstin' | 'business_pan' | 'cin';

function kycLabel(f: KycField) {
  if (f === 'gstin') return 'GSTIN';
  if (f === 'business_pan') return 'Business PAN';
  return 'CIN';
}

function kycSub(f: KycField) {
  if (f === 'gstin') return 'GST Identification Number (15 chars)';
  if (f === 'business_pan') return 'Permanent Account Number (10 chars)';
  return 'Company Identification Number (21 chars)';
}

function kycPlaceholder(f: KycField) {
  if (f === 'gstin') return '27AAAAA0000A1Z5';
  if (f === 'business_pan') return 'AAAAA0000A';
  return 'U12345MH2024PTC123456';
}

export function validateKyc(f: KycField, val: string): string | null {
  const v = val.trim().toUpperCase();
  if (!v) return null;
  if (f === 'gstin' && !/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/.test(v)) {
    return 'Invalid GSTIN format';
  }
  if (f === 'business_pan' && !/^[A-Z]{5}\d{4}[A-Z]$/.test(v)) {
    return 'Invalid PAN format (e.g. AAAAA0000A)';
  }
  if (f === 'cin' && v.length !== 21) {
    return 'CIN must be exactly 21 characters';
  }
  return null;
}

export function kycCompletionPct(kyc: WorkspaceKyc | null): number {
  if (!kyc) return 0;
  const fields: KycField[] = ['gstin', 'business_pan', 'cin'];
  return Math.round((fields.filter((f) => !!kyc[f]).length / fields.length) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function SectionHeader({ label, color = AMBER }: { label: string; color?: string }) {
  return (
    <View style={sh.wrap}>
      <View style={[sh.accent, { backgroundColor: color }]} />
      <Text style={sh.title}>{label}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  accent: { width: 4, height: 16, borderRadius: 2 },
  title: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Theme.textSecondary,
  },
});

export function KycProgressBlock({
  pct,
  barColor,
}: {
  pct: number;
  barColor: string;
}) {
  return (
    <View style={kp.wrap}>
      <View style={kp.track}>
        <View
          style={[
            kp.fill,
            { width: `${pct}%` as `${number}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={kp.label}>{pct}% complete</Text>
    </View>
  );
}

const kp = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  track: {
    height: 6,
    borderRadius: 4,
    backgroundColor: Theme.surfaceGray,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  label: { fontSize: 11, fontWeight: '700', color: Theme.textMuted, letterSpacing: 0.3 },
});

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const ir = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    minHeight: 48,
  },
  label: { fontSize: 13, color: Theme.textMuted, fontWeight: '500', flexShrink: 0 },
  value: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textAlign: 'right',
    flex: 1,
    minWidth: 0,
  },
});

export function OrgIdCopyRow({
  orgId,
  copying,
  onCopy,
}: {
  orgId: string;
  copying: boolean;
  onCopy: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [oid.row, pressed && { backgroundColor: Theme.surfaceGray }]}
      onPress={onCopy}
      accessibilityRole="button"
      accessibilityLabel="Copy organisation ID"
    >
      <View style={[oid.icon, { backgroundColor: PURPLE_TINT }]}>
        {copying ? (
          <Check size={14} color={GREEN} strokeWidth={2.8} />
        ) : (
          <Copy size={14} color={PURPLE} strokeWidth={2.2} />
        )}
      </View>
      <View style={oid.text}>
        <Text style={oid.label}>Org ID</Text>
        <Text style={oid.value} numberOfLines={1}>
          {orgId || '—'}
        </Text>
      </View>
      <Text style={oid.hint}>{copying ? 'Copied!' : 'Copy'}</Text>
    </Pressable>
  );
}

export function NavRow({
  icon,
  iconBg,
  label,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  sub?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [nr.row, pressed && { backgroundColor: Theme.surfaceGray }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[nr.icon, iconBg ? { backgroundColor: iconBg } : null]}>{icon}</View>
      <View style={nr.text}>
        <Text style={nr.label}>{label}</Text>
        {sub ? <Text style={nr.sub}>{sub}</Text> : null}
      </View>
      <ChevronRight size={15} color={Theme.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

const nr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight, minHeight: 52 },
  icon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.surfaceGray },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: '600', color: Theme.textPrimaryDark },
  sub: { fontSize: 11, color: Theme.textMuted, marginTop: 1 },
});

// ─── Inline KYC field editor ──────────────────────────────────────────────────

export function KycFieldRow({
  field,
  value,
  verificationStatus,
  canEdit,
  onSave,
}: {
  field: KycField;
  value: string | null | undefined;
  verificationStatus: string | null | undefined;
  canEdit: boolean;
  onSave: (field: KycField, val: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [validationErr, setValidationErr] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const isVerified = verificationStatus === 'verified';
  const hasValue = !!value?.trim();

  const statusIcon = isVerified
    ? <CheckCircle2 size={15} color={GREEN} strokeWidth={2.2} />
    : hasValue
    ? <Clock size={15} color={AMBER} strokeWidth={2.2} />
    : <CircleDashed size={15} color={Theme.textMuted} strokeWidth={2} />;

  const statusText = isVerified ? 'Verified' : hasValue ? (value ?? '') : 'Not added';
  const statusColor = isVerified ? GREEN : hasValue ? AMBER : Theme.textMuted;
  const statusBg = isVerified ? GREEN_TINT : hasValue ? AMBER_TINT : Theme.surfaceGray;

  const handleEdit = () => {
    if (!canEdit || isVerified) return;
    setDraft(value ?? '');
    setValidationErr(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleSave = async () => {
    const err = validateKyc(field, draft);
    if (err) { setValidationErr(err); return; }
    setSaving(true);
    try {
      await onSave(field, draft.trim().toUpperCase());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const statusLine = isVerified
    ? 'Verified'
    : hasValue
      ? statusText
      : 'Not added';

  return (
    <View style={kf.wrap}>
      <View style={[kf.iconBox, { backgroundColor: statusBg }]}>{statusIcon}</View>
      <View style={kf.body}>
        <Text style={kf.label}>{kycLabel(field)}</Text>
        <Text style={kf.sub} numberOfLines={2}>
          {kycSub(field)}
          <Text style={kf.subMuted}> / </Text>
          <Text style={[kf.subStatus, { color: statusColor }]}>{statusLine}</Text>
        </Text>
        {editing ? (
          <View style={kf.editRow}>
            <TextInput
              ref={inputRef}
              style={kf.input}
              value={draft}
              onChangeText={(t) => { setDraft(t); setValidationErr(null); }}
              placeholder={kycPlaceholder(field)}
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
            />
            <Pressable style={kf.saveBtn} onPress={() => void handleSave()} disabled={saving}>
              {saving ? <LoadingIndicator size="small" color="#fff" /> : <Check size={14} color="#fff" strokeWidth={2.8} />}
            </Pressable>
            <Pressable style={kf.cancelBtn} onPress={() => setEditing(false)}>
              <Text style={kf.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        {validationErr ? <Text style={kf.errText}>{validationErr}</Text> : null}
      </View>
      {canEdit && !isVerified && !editing ? (
        <Pressable style={kf.editBtn} onPress={handleEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${kycLabel(field)}`}>
          <Pencil size={12} color={PURPLE} strokeWidth={2.4} />
          <Text style={kf.editBtnText}>Edit</Text>
        </Pressable>
      ) : isVerified ? (
        <Lock size={14} color={Theme.textMuted} strokeWidth={2} style={kf.lockIcon} />
      ) : null}
    </View>
  );
}

const kf = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    minHeight: 64,
  },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 3 },
  label: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  sub: { fontSize: 11, color: Theme.textMuted, lineHeight: 15 },
  subMuted: { color: Theme.textMuted },
  subStatus: { fontWeight: '600' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  input: { flex: 1, fontSize: 13, fontWeight: '600', color: Theme.textPrimaryDark, borderWidth: 1.5, borderColor: PURPLE_BORDER, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: Theme.surface },
  saveBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { paddingHorizontal: 8 },
  cancelText: { fontSize: 12, color: Theme.textMuted, fontWeight: '600' },
  errText: { fontSize: 10, color: Theme.negative, marginTop: 3 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: PURPLE_TINT,
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
  },
  editBtnText: { fontSize: 11, fontWeight: '700', color: PURPLE },
  lockIcon: { marginRight: 4 },
});

const oid = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    minHeight: 64,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  value: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: { fontSize: 12, fontWeight: '700', color: PURPLE },
});


export const workspacePanelStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },

  // Hero
  hero: { paddingHorizontal: Layout.screenPaddingHorizontal, paddingBottom: 24 },
  heroTopBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 4 },
  backBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  heroTitleWrap: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.1 },
  heroSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  saveChip: { minWidth: 52, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  saveChipActive: { backgroundColor: 'rgba(255,255,255,0.28)', borderColor: 'rgba(255,255,255,0.45)' },
  saveChipText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  saveChipPlaceholder: { width: 52 },

  heroBody: { alignItems: 'center', paddingTop: 6, gap: 8 },
  logoWrap: { position: 'relative', width: 80, height: 80 },
  logoImage: { width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  logoPlaceholder: { width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  logoInitials: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  logoCameraBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 7, backgroundColor: PURPLE_MID, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  heroOrgName: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.2, textAlign: 'center' },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  modelBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  viewOnlyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  viewOnlyText: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  // Content (legacy full-page panels)
  content: { padding: Layout.screenPaddingHorizontal, gap: 14 },
  /** Detail pane cards — aligned with split-panel screenshot */
  detailCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },

  // KYC banner
  kycBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: AMBER_TINT, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)', paddingHorizontal: 14, paddingVertical: 12 },
  kycBannerTitle: { fontSize: 13, fontWeight: '700', color: AMBER },
  kycBannerSub: { fontSize: 11, color: AMBER, opacity: 0.8, marginTop: 1 },

  // KYC progress
  kycProgressWrap: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  kycTrack: { height: 5, borderRadius: 3, backgroundColor: Theme.surfaceGray, overflow: 'hidden' },
  kycFill: { height: '100%', borderRadius: 3 },
  kycPctLabel: { fontSize: 10, fontWeight: '700', color: Theme.textMuted, letterSpacing: 0.4 },
  kycReadonlyNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Theme.surfaceGray },
  kycReadonlyText: { fontSize: 11, color: Theme.textMuted, flex: 1 },

  // Org name field
  nameInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Theme.borderMedium, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Theme.surface, gap: 10, marginHorizontal: 14, marginBottom: 2 },
  nameInput: { flex: 1, fontSize: 16, fontWeight: '700', color: Theme.textPrimaryDark },
  nameInputReadonly: { color: Theme.textSecondary },
  nameSaveBtn: { borderRadius: 14, overflow: 'hidden', marginHorizontal: 14, marginBottom: 14 },
  nameSaveGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  nameSaveTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Invoice preview
  previewPaper: { borderWidth: 1, borderColor: Theme.borderLight, borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden', paddingVertical: 20, paddingHorizontal: 16, minHeight: 110, justifyContent: 'center', position: 'relative', margin: 14, marginTop: 4 },
  previewWatermark: { position: 'absolute', transform: [{ rotate: '-30deg' }], fontSize: 28, fontWeight: '900', color: 'rgba(15,23,42,0.05)', textTransform: 'uppercase', alignSelf: 'center' },
  previewLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewLogo: { width: 48, height: 48, borderRadius: 10, backgroundColor: Theme.surfaceGray },
  previewLogoFallback: { width: 48, height: 48, borderRadius: 10, backgroundColor: PURPLE_TINT, alignItems: 'center', justifyContent: 'center' },
  previewLogoInitials: { fontSize: 16, fontWeight: '900', color: PURPLE },
  previewCompanyName: { fontSize: 16, fontWeight: '900', color: Theme.textPrimaryDark, letterSpacing: 1 },
  previewDocType: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },

  // Logo upload row
  logoUploadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  logoThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: Theme.surfaceGray, borderWidth: 1, borderColor: Theme.borderLight },
  logoThumbFallback: { width: 48, height: 48, borderRadius: 12, backgroundColor: PURPLE_TINT, alignItems: 'center', justifyContent: 'center' },
  logoThumbInitials: { fontSize: 16, fontWeight: '900', color: PURPLE },
  logoUploadInfo: { flex: 1, minWidth: 0, gap: 2 },
  logoUploadTitle: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  logoUploadSub: { fontSize: 11, color: Theme.textSecondary },
  logoUploadChip: { width: 34, height: 34, borderRadius: 10, backgroundColor: PURPLE_TINT, alignItems: 'center', justifyContent: 'center' },

  // Org identity
  copyHint: { fontSize: 12, fontWeight: '600', color: PURPLE },

  // Note card
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: TEAL_TINT, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(15,118,110,0.2)', padding: 14 },
  noteTitle: { fontSize: 12, fontWeight: '700', color: TEAL, marginBottom: 3 },
  noteBody: { fontSize: 11, color: TEAL, opacity: 0.85, lineHeight: 16 },
});
