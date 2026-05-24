/**
 * Workspace — canonical org control center.
 * Covers: logo, name, operating model, KYC/compliance, team, invoice branding.
 * All mutations are gated by useOrgRole() — admin/owner only.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  getWorkspaceKyc,
  updateOrganizationLogo,
  updateOrganizationName,
  updateWorkspaceKyc,
} from '@/features/organization/services/organization.service';
import { syncBrandingFromOrg } from '@/features/invoicing/services/invoiceBranding.service';
import { useOrgRole } from '@/lib/hooks/useOrgRole';
import { ROUTES } from '@/lib/routes';
import {
  getSignedAvatarUrl,
  pickAndUploadOrgLogo,
} from '@/lib/avatarUpload';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock,
  Copy,
  FileText,
  ImagePlus,
  Lock,
  Pencil,
  Shield,
  Users,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WorkspaceKyc } from '@/types/organization';

const PURPLE = '#1a237e';
const PURPLE_MID = '#312e81';
const PURPLE_TINT = 'rgba(26,35,126,0.08)';
const PURPLE_BORDER = 'rgba(26,35,126,0.18)';
const TEAL = '#0f766e';
const TEAL_TINT = 'rgba(15,118,110,0.08)';
const AMBER = '#d97706';
const AMBER_TINT = 'rgba(217,119,6,0.08)';
const GREEN = '#16a34a';
const GREEN_TINT = 'rgba(22,163,74,0.08)';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0]![0] ?? '').toUpperCase();
  return ((words[0]![0] ?? '') + (words[words.length - 1]![0] ?? '')).toUpperCase();
}

function modelLabel(m: string | undefined): string {
  switch (m) {
    case 'ASSET_BASED': return 'Asset-based';
    case 'NON_ASSET': return 'Non-asset';
    case 'HYBRID': return 'Hybrid';
    default: return 'Hybrid';
  }
}

function modelColor(m: string | undefined): string {
  switch (m) {
    case 'ASSET_BASED': return TEAL;
    case 'NON_ASSET': return AMBER;
    default: return PURPLE;
  }
}

type KycField = 'gstin' | 'business_pan' | 'cin';

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

function validateKyc(f: KycField, val: string): string | null {
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

function kycCompletionPct(kyc: WorkspaceKyc | null): number {
  if (!kyc) return 0;
  const fields: KycField[] = ['gstin', 'business_pan', 'cin'];
  return Math.round((fields.filter((f) => !!kyc[f]).length / fields.length) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, color = PURPLE }: { label: string; color?: string }) {
  return (
    <View style={sh.wrap}>
      <View style={[sh.accent, { backgroundColor: color }]} />
      <Text style={sh.title}>{label}</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  accent: { width: 3, height: 14, borderRadius: 2 },
  title: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: Theme.textMuted },
});

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );
}

const ir = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  label: { fontSize: 12, color: Theme.textMuted, fontWeight: '500' },
  value: { fontSize: 13, fontWeight: '700', color: Theme.textPrimaryDark, maxWidth: '60%' },
});

function NavRow({
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

function KycFieldRow({
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

  return (
    <View style={kf.wrap}>
      <View style={[kf.iconBox, { backgroundColor: statusBg }]}>{statusIcon}</View>
      <View style={kf.body}>
        <View style={kf.labelRow}>
          <Text style={kf.label}>{kycLabel(field)}</Text>
          <Text style={kf.sub}>{kycSub(field)}</Text>
        </View>
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
        ) : (
          <Text style={[kf.valueText, { color: statusColor }]}>{statusText}</Text>
        )}
        {validationErr ? <Text style={kf.errText}>{validationErr}</Text> : null}
      </View>
      {canEdit && !isVerified && !editing ? (
        <Pressable style={kf.editBadge} onPress={handleEdit} hitSlop={8}>
          <Pencil size={11} color={PURPLE} strokeWidth={2.4} />
        </Pressable>
      ) : isVerified ? (
        <Lock size={13} color={Theme.textMuted} strokeWidth={2} />
      ) : null}
    </View>
  );
}

const kf = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  iconBox: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  body: { flex: 1, minWidth: 0 },
  labelRow: { gap: 1 },
  label: { fontSize: 13, fontWeight: '700', color: Theme.textPrimaryDark },
  sub: { fontSize: 10, color: Theme.textMuted },
  valueText: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  input: { flex: 1, fontSize: 13, fontWeight: '600', color: Theme.textPrimaryDark, borderWidth: 1.5, borderColor: PURPLE_BORDER, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: Theme.surface },
  saveBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { paddingHorizontal: 8 },
  cancelText: { fontSize: 12, color: Theme.textMuted, fontWeight: '600' },
  errText: { fontSize: 10, color: Theme.negative, marginTop: 3 },
  editBadge: { width: 26, height: 26, borderRadius: 7, backgroundColor: PURPLE_TINT, borderWidth: 1, borderColor: PURPLE_BORDER, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function WorkspaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { currentOrganization, refreshOrganization } = useOrganization();
  const { canEdit, isOwner, isLoading: roleLoading } = useOrgRole();

  const orgId = currentOrganization?.id ?? '';
  const storedName = currentOrganization?.name ?? '';

  const [orgName, setOrgName] = useState(storedName);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [copying, setCopying] = useState(false);
  const [kyc, setKyc] = useState<WorkspaceKyc | null>(null);
  const [kycSaving, setKycSaving] = useState(false);

  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => { if (storedName) setOrgName(storedName); }, [storedName]);

  useEffect(() => {
    if (!orgId) return;
    getWorkspaceKyc(orgId).then(({ kyc: data }) => { if (data) setKyc(data); });
  }, [orgId]);

  useEffect(() => {
    let mounted = true;
    const raw = currentOrganization?.logo_url?.trim();
    if (!raw) { setLogoUri(null); return; }
    if (raw.startsWith('http')) { setLogoUri(raw); return; }
    getSignedAvatarUrl(raw).then((signed) => { if (mounted) setLogoUri(signed ?? null); });
    return () => { mounted = false; };
  }, [currentOrganization?.logo_url]);

  const handleUploadLogo = async () => {
    if (!orgId || logoUploading || !canEdit) return;
    setLogoUploading(true);
    try {
      const result = await pickAndUploadOrgLogo(orgId);
      if (result.error) { Alert.alert('Upload failed', result.error.message); return; }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) { Alert.alert('Save failed', error.message); return; }
      if (result.previewUri) setLogoUri(result.previewUri);
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, orgName, result.path);
    } finally {
      setLogoUploading(false);
    }
  };

  const isDirty = orgName.trim() !== storedName.trim() && orgName.trim().length > 0;

  const handleSaveName = async () => {
    if (!orgId || nameSaving || !isDirty) return;
    const trimmed = orgName.trim();
    if (!trimmed) { Alert.alert('Invalid name', 'Organisation name cannot be empty.'); return; }
    setNameSaving(true);
    try {
      const { error } = await updateOrganizationName(orgId, trimmed);
      if (error) { Alert.alert('Save failed', error.message); return; }
      await refreshOrganization();
      await syncBrandingFromOrg(orgId, trimmed, currentOrganization?.logo_url ?? null);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2200);
    } finally {
      setNameSaving(false);
    }
  };

  const handleCopyOrgId = async () => {
    if (!orgId || copying) return;
    setCopying(true);
    try {
      await Clipboard.setStringAsync(orgId);
      setTimeout(() => setCopying(false), 1400);
    } catch {
      setCopying(false);
    }
  };

  const handleSaveKycField = async (field: KycField, val: string) => {
    if (!orgId || kycSaving) return;
    setKycSaving(true);
    try {
      const patch: Partial<WorkspaceKyc> = { [field]: val || null };
      const { kyc: updated, error } = await updateWorkspaceKyc(orgId, patch);
      if (error) { Alert.alert('Save failed', error.message); }
      else if (updated) setKyc(updated);
    } finally {
      setKycSaving(false);
    }
  };

  const previewName = orgName.trim() || storedName || 'YOUR ORG';
  const kycPct = kycCompletionPct(kyc);
  const kycMissing = kyc ? (['gstin', 'business_pan', 'cin'] as KycField[]).filter((f) => !kyc[f]).length : 3;

  return (
    <View style={styles.screen}>
      {/* ── Purple gradient hero ── */}
      <LinearGradient
        colors={[PURPLE, PURPLE_MID, '#2d1b69']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 6 }]}
      >
        <View style={styles.heroTopBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <FontAwesome name="arrow-left" size={17} color="rgba(255,255,255,0.9)" />
          </Pressable>
          <View style={styles.heroTitleWrap}>
            <Text style={styles.heroTitle}>Workspace</Text>
            <Text style={styles.heroSubtitle}>Org identity · KYC · team</Text>
          </View>
          {isDirty && canEdit ? (
            <Pressable
              style={[styles.saveChip, styles.saveChipActive]}
              onPress={() => void handleSaveName()}
              disabled={nameSaving}
              hitSlop={8}
            >
              {nameSaving ? (
                <LoadingIndicator size="small" color="#fff" />
              ) : nameSaved ? (
                <Check size={15} color="#fff" strokeWidth={3} />
              ) : (
                <Text style={styles.saveChipText}>Save</Text>
              )}
            </Pressable>
          ) : (
            <View style={styles.saveChipPlaceholder} />
          )}
        </View>

        {/* Org logo + name + model badge */}
        <Pressable
          style={({ pressed }) => [styles.heroBody, pressed && canEdit && { opacity: 0.82 }]}
          onPress={canEdit ? () => void handleUploadLogo() : undefined}
          accessibilityRole={canEdit ? 'button' : undefined}
          accessibilityLabel={canEdit ? 'Change organisation logo' : undefined}
        >
          <View style={styles.logoWrap}>
            {logoUploading ? (
              <View style={styles.logoPlaceholder}>
                <LoadingIndicator size="small" color="rgba(255,255,255,0.8)" />
              </View>
            ) : logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoInitials}>{orgInitials(previewName)}</Text>
              </View>
            )}
            {canEdit ? (
              <View style={styles.logoCameraBadge}>
                <ImagePlus size={12} color="#fff" strokeWidth={2.2} />
              </View>
            ) : null}
          </View>
          <Text style={styles.heroOrgName} numberOfLines={1}>{previewName}</Text>
          <View style={styles.heroMeta}>
            <View style={[styles.modelBadge, { backgroundColor: modelColor(currentOrganization?.operatingModel) + '30', borderColor: modelColor(currentOrganization?.operatingModel) + '50' }]}>
              <Text style={[styles.modelBadgeText, { color: '#fff' }]}>{modelLabel(currentOrganization?.operatingModel)}</Text>
            </View>
            {!canEdit ? (
              <View style={styles.viewOnlyBadge}>
                <Lock size={9} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
                <Text style={styles.viewOnlyText}>View only</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </LinearGradient>

      {/* ── Content ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Layout.sectionSpacing }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* KYC banner if incomplete and canEdit */}
          {canEdit && kycMissing > 0 ? (
            <View style={styles.kycBanner}>
              <AlertTriangle size={15} color={AMBER} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.kycBannerTitle}>
                  {kycMissing === 3 ? 'KYC not started' : `${kycMissing} compliance field${kycMissing > 1 ? 's' : ''} missing`}
                </Text>
                <Text style={styles.kycBannerSub}>Complete KYC to unlock billing and invoicing</Text>
              </View>
            </View>
          ) : null}

          {/* ── Org Name ── */}
          <View style={styles.card}>
            <SectionHeader label="Organisation Name" />
            <View style={styles.nameInputWrap}>
              <TextInput
                ref={nameInputRef}
                style={[styles.nameInput, !canEdit && styles.nameInputReadonly]}
                value={orgName}
                onChangeText={canEdit ? setOrgName : undefined}
                placeholder="e.g. GoGoX Logistics"
                placeholderTextColor={Theme.textMuted}
                maxLength={64}
                editable={canEdit}
                returnKeyType="done"
                onSubmitEditing={() => { if (isDirty) void handleSaveName(); }}
              />
              {canEdit ? <Pencil size={14} color={Theme.textMuted} strokeWidth={2} /> : <Lock size={14} color={Theme.textMuted} strokeWidth={2} />}
            </View>
            {isDirty && canEdit ? (
              <Pressable
                style={({ pressed }) => [styles.nameSaveBtn, pressed && { opacity: 0.85 }]}
                onPress={() => void handleSaveName()}
                disabled={nameSaving}
              >
                <LinearGradient colors={[PURPLE, PURPLE_MID]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nameSaveGradient}>
                  {nameSaving ? <LoadingIndicator size="small" color="#fff" /> : nameSaved ? (
                    <><Check size={14} color="#fff" strokeWidth={2.8} /><Text style={styles.nameSaveTxt}>Saved</Text></>
                  ) : (
                    <Text style={styles.nameSaveTxt}>Save Name</Text>
                  )}
                </LinearGradient>
              </Pressable>
            ) : null}
          </View>

          {/* ── KYC & Compliance ── */}
          <View style={styles.card}>
            <SectionHeader label="Compliance & KYC" color={kycPct === 100 ? GREEN : AMBER} />
            <View style={styles.kycProgressWrap}>
              <View style={styles.kycTrack}>
                <View style={[styles.kycFill, { width: `${kycPct}%` as any, backgroundColor: kycPct === 100 ? GREEN : kycPct > 50 ? AMBER : Theme.negative }]} />
              </View>
              <Text style={styles.kycPctLabel}>{kycPct}% complete</Text>
            </View>
            {!canEdit ? (
              <View style={styles.kycReadonlyNote}>
                <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
                <Text style={styles.kycReadonlyText}>Only admins and owners can edit KYC fields.</Text>
              </View>
            ) : null}
            <KycFieldRow field="gstin" value={kyc?.gstin} verificationStatus={kyc?.verification_status} canEdit={canEdit} onSave={handleSaveKycField} />
            <KycFieldRow field="business_pan" value={kyc?.business_pan} verificationStatus={kyc?.verification_status} canEdit={canEdit} onSave={handleSaveKycField} />
            <KycFieldRow field="cin" value={kyc?.cin} verificationStatus={kyc?.verification_status} canEdit={canEdit} onSave={handleSaveKycField} />
          </View>

          {/* ── Invoice Preview ── */}
          <View style={styles.card}>
            <SectionHeader label="Invoice Branding" />
            <View style={styles.previewPaper}>
              <Text style={styles.previewWatermark}>{previewName}</Text>
              <View style={styles.previewLogoRow}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.previewLogo} />
                ) : (
                  <View style={styles.previewLogoFallback}>
                    <Text style={styles.previewLogoInitials}>{orgInitials(previewName)}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.previewCompanyName}>{previewName.toUpperCase()}</Text>
                  <Text style={styles.previewDocType}>Commercial Invoice</Text>
                </View>
              </View>
            </View>
            {canEdit ? (
              <Pressable
                style={({ pressed }) => [styles.logoUploadRow, pressed && { opacity: 0.85 }]}
                onPress={() => void handleUploadLogo()}
                disabled={logoUploading}
              >
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoThumb} />
                ) : (
                  <View style={styles.logoThumbFallback}>
                    <Text style={styles.logoThumbInitials}>{orgInitials(previewName)}</Text>
                  </View>
                )}
                <View style={styles.logoUploadInfo}>
                  <Text style={styles.logoUploadTitle}>{logoUri ? 'Change logo' : 'Upload logo'}</Text>
                  <Text style={styles.logoUploadSub}>Square PNG or JPEG recommended</Text>
                </View>
                {logoUploading ? <LoadingIndicator size="small" color={Theme.textMuted} /> : (
                  <View style={styles.logoUploadChip}>
                    <ImagePlus size={14} color={PURPLE} strokeWidth={2.2} />
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>

          {/* ── Workspace ── */}
          <View style={styles.card}>
            <SectionHeader label="Workspace" />
            <NavRow
              icon={<Users size={16} color={PURPLE} strokeWidth={2.2} />}
              iconBg={PURPLE_TINT}
              label="Team members"
              sub="Manage roles and invitations"
              onPress={() => router.push(ROUTES.MODALS.TEAM as Parameters<typeof router.push>[0])}
            />
            {isOwner ? (
              <NavRow
                icon={<Shield size={16} color={AMBER} strokeWidth={2.2} />}
                iconBg={AMBER_TINT}
                label="Transfer ownership"
                sub="Move full admin control to another member"
                onPress={() => Alert.alert('Coming soon', 'Transfer ownership will be available in the next update.')}
              />
            ) : null}
          </View>

          {/* ── Org identity info ── */}
          <View style={styles.card}>
            <SectionHeader label="Org Identity" />
            <Pressable
              style={({ pressed }) => [nr.row, pressed && { backgroundColor: Theme.surfaceGray }]}
              onPress={() => void handleCopyOrgId()}
            >
              <View style={[nr.icon, { backgroundColor: PURPLE_TINT }]}>
                {copying ? <Check size={14} color={GREEN} strokeWidth={2.8} /> : <Copy size={14} color={PURPLE} strokeWidth={2.2} />}
              </View>
              <View style={nr.text}>
                <Text style={nr.label}>Org ID</Text>
                <Text style={[nr.sub, { fontFamily: 'Courier', letterSpacing: 0.2 }]} numberOfLines={1}>{orgId || '—'}</Text>
              </View>
              <Text style={styles.copyHint}>{copying ? 'Copied!' : 'Copy'}</Text>
            </Pressable>
            <InfoRow label="Operating model" value={modelLabel(currentOrganization?.operatingModel)} />
            {user?.email ? <InfoRow label="Owner email" value={user.email} /> : null}
          </View>

          {/* ── Invoice info note ── */}
          <View style={styles.noteCard}>
            <FileText size={14} color={TEAL} strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noteTitle}>Invoice = agreed rate, not POD</Text>
              <Text style={styles.noteBody}>
                Invoices are generated from the agreed client rate the moment a trip is completed.
                POD documents are separate compliance uploads and do not block invoicing.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
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

  // Content
  content: { padding: Layout.screenPaddingHorizontal, gap: 14 },
  card: { backgroundColor: Theme.cardWhite, borderRadius: 18, borderWidth: 1, borderColor: Theme.borderInput, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },

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
