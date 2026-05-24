import { LoadingIndicator } from '@/components/LoadingIndicator';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  getWorkspaceKyc,
  updateWorkspaceKyc,
} from '@/features/organization/services/organization.service';
import type { KycVerificationStatus, WorkspaceKyc } from '@/types/organization';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Validation ───────────────────────────────────────────────────────────────

const PAN_RE   = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function validatePan(v: string)   { return !v || PAN_RE.test(v) ? null : 'PAN must be 10 characters: ABCDE1234F'; }
function validateGstin(v: string) { return !v || GSTIN_RE.test(v) ? null : 'GSTIN must be 15 characters (e.g. 22ABCDE1234F1Z5)'; }
function validateCin(v: string)   { return !v || v.length === 21 ? null : 'CIN must be exactly 21 characters'; }

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<KycVerificationStatus, { label: string; color: string; bg: string; icon: string }> = {
  unverified: { label: 'Not verified',  color: Theme.iconSlate, bg: Theme.surfaceGray, icon: 'circle-o' },
  pending:    { label: 'Under review',  color: Theme.warning,   bg: '#FEF3C7',         icon: 'clock-o' },
  verified:   { label: 'Verified',      color: Theme.darkGreen, bg: '#DCFCE7',         icon: 'check-circle' },
  rejected:   { label: 'Rejected',      color: '#DC2626',       bg: '#FEE2E2',         icon: 'times-circle' },
};

function StatusBadge({ status }: { status: KycVerificationStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <FontAwesome name={cfg.icon as never} size={12} color={cfg.color} />
      <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function KycSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();

  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving, setIsSaving]     = useState(false);
  const [kyc, setKyc]               = useState<WorkspaceKyc | null>(null);

  const [pan, setPan]     = useState('');
  const [gstin, setGstin] = useState('');
  const [cin, setCin]     = useState('');

  const [panErr, setPanErr]     = useState<string | null>(null);
  const [gstinErr, setGstinErr] = useState<string | null>(null);
  const [cinErr, setCinErr]     = useState<string | null>(null);

  const gstinRef = useRef<TextInput>(null);
  const cinRef   = useRef<TextInput>(null);

  useEffect(() => {
    if (!currentOrganization?.id) return;
    let mounted = true;
    (async () => {
      const { error, kyc: data } = await getWorkspaceKyc(currentOrganization.id);
      if (!mounted) return;
      if (!error && data) {
        setKyc(data);
        setPan(data.business_pan ?? '');
        setGstin(data.gstin ?? '');
        setCin(data.cin ?? '');
      }
      setIsLoading(false);
    })();
    return () => { mounted = false; };
  }, [currentOrganization?.id]);

  const isVerified = kyc?.verification_status === 'verified';

  function validate() {
    const pErr = validatePan(pan.trim().toUpperCase());
    const gErr = validateGstin(gstin.trim().toUpperCase());
    const cErr = validateCin(cin.trim().toUpperCase());
    setPanErr(pErr);
    setGstinErr(gErr);
    setCinErr(cErr);
    return !pErr && !gErr && !cErr;
  }

  async function handleSave() {
    if (!currentOrganization?.id) return;
    if (!validate()) return;
    if (isVerified) {
      Alert.alert('Already verified', 'Your workspace is already verified. Contact support to update KYC details.');
      return;
    }

    setIsSaving(true);
    const { error, kyc: updated } = await updateWorkspaceKyc(currentOrganization.id, {
      business_pan: pan.trim().toUpperCase() || null,
      gstin:        gstin.trim().toUpperCase() || null,
      cin:          cin.trim().toUpperCase() || null,
    });
    setIsSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    if (updated) setKyc(updated);
    Alert.alert('Submitted', 'Your KYC details have been submitted for review.');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="arrow-left" size={18} color={Theme.textPrimaryDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Business Verification</Text>
          <Text style={styles.subtitle}>KYC · PAN · GSTIN · CIN</Text>
        </View>
        {kyc && <StatusBadge status={kyc.verification_status} />}
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <LoadingIndicator size="small" color={Theme.primary} />
          <Text style={styles.loadingText}>Loading KYC details…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Layout.sectionSpacing }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info / rejection banner */}
          {kyc?.verification_status === 'rejected' && kyc.kyc_rejected_reason ? (
            <View style={styles.rejectionBanner}>
              <FontAwesome name="exclamation-triangle" size={14} color="#DC2626" />
              <Text style={styles.rejectionText}>
                {'Rejected: '}{kyc.kyc_rejected_reason}
              </Text>
            </View>
          ) : kyc?.verification_status === 'pending' ? (
            <View style={styles.pendingBanner}>
              <FontAwesome name="clock-o" size={14} color={Theme.warning} />
              <Text style={styles.pendingText}>
                Your documents are under review. We'll notify you within 1–2 business days.
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Business Identity</Text>

            <Text style={styles.label}>PAN (Permanent Account Number)</Text>
            <TextInput
              style={[styles.input, panErr ? styles.inputError : null]}
              value={pan}
              onChangeText={v => { setPan(v.toUpperCase()); setPanErr(null); }}
              placeholder="ABCDE1234F"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              editable={!isVerified}
              returnKeyType="next"
              onSubmitEditing={() => gstinRef.current?.focus()}
            />
            {panErr ? <Text style={styles.fieldError}>{panErr}</Text> : null}

            <Text style={[styles.label, { marginTop: 16 }]}>GSTIN (GST Identification Number)</Text>
            <TextInput
              ref={gstinRef}
              style={[styles.input, gstinErr ? styles.inputError : null]}
              value={gstin}
              onChangeText={v => { setGstin(v.toUpperCase()); setGstinErr(null); }}
              placeholder="22ABCDE1234F1Z5"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={15}
              editable={!isVerified}
              returnKeyType="next"
              onSubmitEditing={() => cinRef.current?.focus()}
            />
            {gstinErr ? <Text style={styles.fieldError}>{gstinErr}</Text> : null}

            <Text style={[styles.label, { marginTop: 16 }]}>CIN (Corporate Identity Number)</Text>
            <TextInput
              ref={cinRef}
              style={[styles.input, cinErr ? styles.inputError : null]}
              value={cin}
              onChangeText={v => { setCin(v.toUpperCase()); setCinErr(null); }}
              placeholder="L17110MH1973PLC019786"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={21}
              editable={!isVerified}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            {cinErr ? <Text style={styles.fieldError}>{cinErr}</Text> : null}

            <View style={styles.infoBox}>
              <FontAwesome name="info-circle" size={14} color={Theme.textMuted} />
              <Text style={styles.infoText}>
                At least one of PAN, GSTIN, or CIN is required to submit. Verified workspaces display a badge on your public profile.
              </Text>
            </View>
          </View>

          {isVerified ? null : (
            <Pressable
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
              ) : (
                <>
                  <FontAwesome name="send" size={13} color={Theme.buttonPrimaryText} style={{ marginRight: 8 }} />
                  <Text style={styles.saveBtnText}>
                    {kyc?.verification_status === 'rejected' ? 'Resubmit for Review' : 'Submit for Verification'}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surfaceGray,
  },
  title:    { fontSize: 16, fontWeight: '800', color: Theme.textPrimaryDark },
  subtitle: { fontSize: 12, color: Theme.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText:  { fontSize: 13, color: Theme.textMuted },
  content:      { padding: Layout.screenPaddingHorizontal, gap: 12 },
  rejectionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
  },
  rejectionText: { flex: 1, fontSize: 12, color: '#DC2626', lineHeight: 18 },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
  },
  pendingText: { flex: 1, fontSize: 12, color: Theme.warning, lineHeight: 18 },
  card: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'System',
    letterSpacing: 0.5,
  },
  inputError:  { borderColor: '#DC2626' },
  fieldError:  { fontSize: 11, color: '#DC2626', marginTop: 4 },
  infoBox: {
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 11, color: Theme.textSecondary, lineHeight: 16 },
  saveBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
