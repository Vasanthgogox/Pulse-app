/**
 * Company Profile & KYC screen — workspace admin panel.
 *
 * Shows workspace logo, TMS metrics (trips, drivers, clients), KYC fields
 * (PAN/GSTIN/CIN), and team navigation. Editing is gated to owner/admin roles.
 */
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PulseAvatar } from '@/components/PulseAvatar';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useActiveWorkspace } from '@/contexts/ActiveWorkspaceContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { updateWorkspaceKyc } from '@/features/organization/services/organization.service';
import { pickAndUploadOrgLogo, updateOrganizationLogo } from '@/lib/avatarUpload';
import { useClientsQuery } from '@/lib/queries/useClientsQuery';
import { useDriversQuery } from '@/lib/queries/useDriversQuery';
import { useTripsQuery } from '@/lib/queries/useTripsQuery';
import type { KycVerificationStatus } from '@/types/organization';
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

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function validatePan(v: string) {
  return !v || PAN_RE.test(v) ? null : 'PAN must be 10 characters: ABCDE1234F';
}
function validateGstin(v: string) {
  return !v || GSTIN_RE.test(v)
    ? null
    : 'GSTIN must be 15 characters (e.g. 22ABCDE1234F1Z5)';
}
function validateCin(v: string) {
  return !v || v.length === 21 ? null : 'CIN must be exactly 21 characters';
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC status badge
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  KycVerificationStatus,
  { label: string; color: string; bg: string; icon: string }
> = {
  unverified: {
    label: 'Not verified',
    color: Theme.iconSlate,
    bg: Theme.surfaceGray,
    icon: 'circle-o',
  },
  pending: {
    label: 'Under review',
    color: Theme.warning,
    bg: '#FEF3C7',
    icon: 'clock-o',
  },
  verified: {
    label: 'Verified',
    color: Theme.darkGreen,
    bg: '#DCFCE7',
    icon: 'check-circle',
  },
  rejected: {
    label: 'Rejected',
    color: '#DC2626',
    bg: '#FEE2E2',
    icon: 'times-circle',
  },
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

// ─────────────────────────────────────────────────────────────────────────────
// Stat tile
// ─────────────────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CompanyProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { activeWorkspace, memberRole, refresh } = useActiveWorkspace();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  // TMS metric queries
  const { data: tripsData } = useTripsQuery(orgId ?? '');
  const { data: driversData } = useDriversQuery(orgId ?? '');
  const { data: clientsData } = useClientsQuery(orgId ?? '');

  const totalTrips = (tripsData as unknown[] | undefined)?.length ?? 0;
  const activeDrivers = (driversData ?? []).filter(
    (d: { status?: string }) => d.status === 'active',
  ).length;
  const totalClients = (clientsData ?? []).length;

  // KYC state
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [cin, setCin] = useState('');
  const [panErr, setPanErr] = useState<string | null>(null);
  const [gstinErr, setGstinErr] = useState<string | null>(null);
  const [cinErr, setCinErr] = useState<string | null>(null);
  const [isSavingKyc, setIsSavingKyc] = useState(false);
  const [kycStatus, setKycStatus] = useState<KycVerificationStatus>('unverified');
  const [kycRejectedReason, setKycRejectedReason] = useState<string | null>(null);

  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const gstinRef = useRef<TextInput>(null);
  const cinRef = useRef<TextInput>(null);

  // Populate KYC fields from active workspace
  useEffect(() => {
    if (!activeWorkspace) return;
    setPan(activeWorkspace.business_pan ?? '');
    setGstin(activeWorkspace.gstin ?? '');
    setCin(activeWorkspace.cin ?? '');
    setKycStatus(activeWorkspace.verification_status ?? 'unverified');
    setKycRejectedReason(activeWorkspace.kyc_rejected_reason ?? null);
  }, [activeWorkspace]);

  const isAdmin = memberRole === 'owner' || memberRole === 'admin';
  const isVerified = kycStatus === 'verified';

  // ── Logo upload ─────────────────────────────────────────────────────────────

  async function handleChangeLogo() {
    if (!orgId || !isAdmin) return;
    setIsUploadingLogo(true);
    try {
      const { path, error: pickErr } = await pickAndUploadOrgLogo(orgId);
      if (pickErr) {
        Alert.alert('Upload failed', pickErr.message);
        return;
      }
      if (!path) return; // user cancelled
      const { error: updateErr } = await updateOrganizationLogo(orgId, path);
      if (updateErr) {
        Alert.alert('Error', updateErr.message);
        return;
      }
      await refresh();
    } finally {
      setIsUploadingLogo(false);
    }
  }

  // ── KYC save ────────────────────────────────────────────────────────────────

  function validateKyc() {
    const pErr = validatePan(pan.trim().toUpperCase());
    const gErr = validateGstin(gstin.trim().toUpperCase());
    const cErr = validateCin(cin.trim().toUpperCase());
    setPanErr(pErr);
    setGstinErr(gErr);
    setCinErr(cErr);
    return !pErr && !gErr && !cErr;
  }

  async function handleSaveKyc() {
    if (!orgId) return;
    if (!validateKyc()) return;
    if (isVerified) {
      Alert.alert(
        'Already verified',
        'Your workspace is already verified. Contact support to update KYC details.',
      );
      return;
    }

    setIsSavingKyc(true);
    const { error, kyc: updated } = await updateWorkspaceKyc(orgId, {
      business_pan: pan.trim().toUpperCase() || null,
      gstin: gstin.trim().toUpperCase() || null,
      cin: cin.trim().toUpperCase() || null,
    });
    setIsSavingKyc(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    if (updated) {
      setKycStatus(updated.verification_status as KycVerificationStatus);
      setKycRejectedReason(updated.kyc_rejected_reason ?? null);
    }
    Alert.alert('Submitted', 'Your KYC details have been submitted for review.');
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (!activeWorkspace) {
    return (
      <View style={[styles.loadingScreen, { paddingTop: insets.top }]}>
        <LoadingIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="arrow-left" size={18} color={Theme.textPrimaryDark} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Company Profile</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {activeWorkspace.name}
          </Text>
        </View>
        <StatusBadge status={kycStatus} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Layout.sectionSpacing },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Read-only banner for non-admins */}
        {!isAdmin ? (
          <View style={styles.readOnlyBanner}>
            <FontAwesome name="lock" size={13} color={Theme.warning} />
            <Text style={styles.readOnlyText}>
              Only workspace owners and admins can edit company details.
            </Text>
          </View>
        ) : null}

        {/* Logo section */}
        <View style={styles.logoSection}>
          <PulseAvatar
            surface="business"
            size={80}
            shape="rounded"
            showVerifiedBadge
          />
          {isAdmin ? (
            <Pressable
              style={({ pressed }) => [
                styles.changeLogoBtn,
                pressed && styles.changeLogoBtnPressed,
                isUploadingLogo && styles.changeLogoBtnDisabled,
              ]}
              onPress={handleChangeLogo}
              disabled={isUploadingLogo}
            >
              {isUploadingLogo ? (
                <LoadingIndicator size="small" color={Theme.primary} />
              ) : (
                <>
                  <FontAwesome
                    name="camera"
                    size={12}
                    color={Theme.primary}
                    style={styles.changeLogoBtnIcon}
                  />
                  <Text style={styles.changeLogoBtnText}>Change Logo</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        {/* TMS Metrics */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Overview</Text>
          <View style={styles.statsRow}>
            <StatTile label="Total Trips" value={totalTrips} />
            <View style={styles.statDivider} />
            <StatTile label="Active Drivers" value={activeDrivers} />
            <View style={styles.statDivider} />
            <StatTile label="Clients" value={totalClients} />
          </View>
        </View>

        {/* KYC section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Business Verification</Text>

          {/* Status banners */}
          {kycStatus === 'rejected' && kycRejectedReason ? (
            <View style={styles.rejectionBanner}>
              <FontAwesome name="exclamation-triangle" size={14} color="#DC2626" />
              <Text style={styles.rejectionText}>{'Rejected: '}{kycRejectedReason}</Text>
            </View>
          ) : kycStatus === 'pending' ? (
            <View style={styles.pendingBanner}>
              <FontAwesome name="clock-o" size={14} color={Theme.warning} />
              <Text style={styles.pendingText}>
                Your documents are under review. We'll notify you within 1–2 business days.
              </Text>
            </View>
          ) : null}

          <View style={styles.kycFields}>
            <Text style={styles.fieldLabel}>PAN (Permanent Account Number)</Text>
            <TextInput
              style={[styles.input, panErr ? styles.inputError : null]}
              value={pan}
              onChangeText={(v) => {
                setPan(v.toUpperCase());
                setPanErr(null);
              }}
              placeholder="ABCDE1234F"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              editable={isAdmin && !isVerified}
              returnKeyType="next"
              onSubmitEditing={() => gstinRef.current?.focus()}
            />
            {panErr ? <Text style={styles.fieldError}>{panErr}</Text> : null}

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
              GSTIN (GST Identification Number)
            </Text>
            <TextInput
              ref={gstinRef}
              style={[styles.input, gstinErr ? styles.inputError : null]}
              value={gstin}
              onChangeText={(v) => {
                setGstin(v.toUpperCase());
                setGstinErr(null);
              }}
              placeholder="22ABCDE1234F1Z5"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={15}
              editable={isAdmin && !isVerified}
              returnKeyType="next"
              onSubmitEditing={() => cinRef.current?.focus()}
            />
            {gstinErr ? <Text style={styles.fieldError}>{gstinErr}</Text> : null}

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
              CIN (Corporate Identity Number)
            </Text>
            <TextInput
              ref={cinRef}
              style={[styles.input, cinErr ? styles.inputError : null]}
              value={cin}
              onChangeText={(v) => {
                setCin(v.toUpperCase());
                setCinErr(null);
              }}
              placeholder="L17110MH1973PLC019786"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={21}
              editable={isAdmin && !isVerified}
              returnKeyType="done"
              onSubmitEditing={handleSaveKyc}
            />
            {cinErr ? <Text style={styles.fieldError}>{cinErr}</Text> : null}

            <View style={styles.kycInfoBox}>
              <FontAwesome name="info-circle" size={13} color={Theme.textMuted} />
              <Text style={styles.kycInfoText}>
                At least one of PAN, GSTIN, or CIN is required to submit. Verified workspaces
                display a badge on your public profile.
              </Text>
            </View>
          </View>

          {isAdmin && !isVerified ? (
            <Pressable
              style={({ pressed }) => [
                styles.saveKycBtn,
                (pressed || isSavingKyc) && styles.saveKycBtnDisabled,
              ]}
              onPress={handleSaveKyc}
              disabled={isSavingKyc}
            >
              {isSavingKyc ? (
                <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
              ) : (
                <>
                  <FontAwesome
                    name="send"
                    size={12}
                    color={Theme.buttonPrimaryText}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.saveKycBtnText}>
                    {kycStatus === 'rejected' ? 'Resubmit for Review' : 'Submit for Verification'}
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        {/* Team section */}
        <Pressable
          style={({ pressed }) => [styles.teamRow, pressed && styles.teamRowPressed]}
          onPress={() => router.push('/(modals)/team')}
          accessibilityRole="button"
        >
          <View style={styles.teamRowLeft}>
            <View style={styles.teamIconBox}>
              <FontAwesome name="users" size={15} color={Theme.primary} />
            </View>
            <Text style={styles.teamRowText}>Team Members</Text>
          </View>
          <FontAwesome name="chevron-right" size={13} color={Theme.textSection} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: Layout.screenPaddingHorizontal,
    gap: 16,
  },
  // Read-only banner
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
  },
  readOnlyText: {
    flex: 1,
    fontSize: 12,
    color: Theme.warning,
    lineHeight: 18,
  },
  // Logo section
  logoSection: {
    alignItems: 'center',
    paddingVertical: Layout.sectionSpacing,
    gap: 12,
  },
  changeLogoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  changeLogoBtnPressed: {
    opacity: 0.7,
  },
  changeLogoBtnDisabled: {
    opacity: 0.5,
  },
  changeLogoBtnIcon: {
    marginRight: 2,
  },
  changeLogoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.primary,
  },
  // Card
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderInput,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 0,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    alignSelf: 'stretch',
    marginVertical: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  // KYC
  kycFields: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  rejectionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  rejectionText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
    lineHeight: 18,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  pendingText: {
    flex: 1,
    fontSize: 12,
    color: Theme.warning,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textSecondary,
    marginBottom: 6,
  },
  fieldLabelSpaced: {
    marginTop: 14,
  },
  input: {
    height: 44,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Theme.textPrimaryDark,
  },
  inputError: {
    borderColor: Theme.negative,
  },
  fieldError: {
    fontSize: 11,
    color: Theme.negative,
    marginTop: 4,
  },
  kycInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  kycInfoText: {
    flex: 1,
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  saveKycBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.primary,
    margin: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 13,
  },
  saveKycBtnDisabled: {
    opacity: 0.6,
  },
  saveKycBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.buttonPrimaryText,
  },
  // Team row
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderInput,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  teamRowPressed: {
    opacity: 0.7,
  },
  teamRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
  },
});
