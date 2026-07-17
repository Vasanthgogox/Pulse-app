/**
 * Business Verification Wizard — Sprint 1
 *
 * Three-step guided form that collects:
 *   Step 0 — Legal Details  (registration type, address)
 *   Step 1 — Tax Credentials (GSTIN live-validated, PAN)
 *   Step 2 — Address Proof  (image or PDF upload)
 *
 * On submit → calls submit_business_verification RPC which freezes the row.
 * If the profile is already PENDING or VERIFIED, renders a read-only frozen
 * view instead of the form.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { CheckCircle, Clock, FileText, Lock, Upload, XCircle } from 'lucide-react-native';
import { VerificationTierCard } from './VerificationTierCard';

import Theme from '@/constants/Theme';
import { colors } from '@/design-system/colors';
import { radius } from '@/design-system/radius';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';
import { useOrganization } from '@/contexts/OrganizationContext';
import { OnboardingFocusedField } from '@/features/onboarding/components/OnboardingFocusedField';
import { OperationalButton } from '@/components/operational';
import {
  getWorkspaceKyc,
  updateWorkspaceKyc,
} from '@/features/organization/services/organization.service';
import {
  getAddressProofSignedUrl,
  getVerificationDocuments,
  submitBusinessVerification,
  uploadAddressProof,
  uploadVerificationDocument,
  validateGstin,
  type AddressProofFile,
  type VerificationDocumentFile,
} from '@/features/organization/services/businessVerification.service';
import { isVerificationFrozen } from '@/types/organization';
import type { AddressProofType, RegistrationType, WorkspaceKyc } from '@/types/organization';
import { BUSINESS_TYPE_TO_REGISTRATION } from '@/features/organization/utils/kycVerification.util';

const REGISTRATION_TYPES: { value: RegistrationType; label: string }[] = [
  { value: 'proprietorship', label: 'Proprietorship'          },
  { value: 'llp',            label: 'LLP'                     },
  { value: 'pvt_ltd',        label: 'Private Limited (Pvt Ltd)' },
  { value: 'public_ltd',     label: 'Public Limited'          },
  { value: 'partnership',    label: 'Partnership'             },
];

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX   = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const ADDRESS_PROOF_TYPES: { value: AddressProofType; label: string }[] = [
  { value: 'lease',        label: 'Lease Agreement'  },
  { value: 'utility_bill', label: 'Utility Bill'     },
  { value: 'other',        label: 'Other Government Document' },
];

const TOTAL_STEPS = 3;

const draftKey = (orgId: string) => `business-verify-draft:${orgId}`;

interface WizardDraft {
  step:    number;
  step0:   Step0State;
  gstin:   string;
  pan:     string;
  proofType: AddressProofType | null;
}

// ─── Frozen / read-only view ──────────────────────────────────────────────────

function FrozenStatusView({ kyc }: { kyc: WorkspaceKyc }) {
  const isPending  = kyc.verification_status === 'pending';
  const isVerified = kyc.verification_status === 'verified';
  const isRejected = kyc.verification_status === 'rejected';

  const iconSize = 28;
  const icon = isPending
    ? <Clock size={iconSize} color={Theme.warning ?? '#F59E0B'} />
    : isVerified
    ? <CheckCircle size={iconSize} color={Theme.success} />
    : <XCircle size={iconSize} color={Theme.destructive} />;

  const title   = isPending ? 'Under Review' : isVerified ? 'Verified' : 'Verification Rejected';
  const message = isPending
    ? 'Your business profile has been submitted and is under review. You will be notified once the review is complete.'
    : isVerified
    ? `Verified on ${kyc.verified_at ? new Date(kyc.verified_at).toLocaleDateString('en-IN') : '—'}.`
    : kyc.kyc_rejected_reason ?? 'Your submission was rejected. Please correct the details and resubmit.';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Rejection summary (only shown on REJECTED state) */}
        {isRejected ? (
          <View style={styles.statusCard}>
            <View style={styles.statusIconRow}>{icon}</View>
            <Text style={styles.statusTitle}>{title}</Text>
            <Text style={styles.statusMessage}>{message}</Text>
            {kyc.rejection_reasons?.checklist?.length ? (
              <View style={styles.rejectionList}>
                {kyc.rejection_reasons.checklist.map(r => (
                  <Text key={r} style={styles.rejectionItem}>• {formatRejectionReason(r)}</Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          // Live tier progress card for PENDING / VERIFIED states
          <VerificationTierCard />
        )}

        <SectionHeader label="Submitted Details" />
        <ReadRow label="Company"           value={kyc.name} />
        <ReadRow label="Registration Type" value={REGISTRATION_TYPES.find(t => t.value === kyc.registration_type)?.label} />
        <ReadRow label="GSTIN"             value={kyc.gst_not_applicable ? 'Not applicable' : kyc.gstin} />
        <ReadRow label="PAN"               value={kyc.business_pan} />
        <ReadRow label="CIN"               value={kyc.cin} />

        <SectionHeader label="Operating Address" />
        <ReadRow label="Address" value={kyc.address_line} />
        <ReadRow label="City"    value={kyc.city} />
        <ReadRow label="State"   value={kyc.state} />
        <ReadRow label="Pincode" value={kyc.address_pincode} />

        <SectionHeader label="Document" />
        <ReadRow
          label="Address Proof Type"
          value={ADDRESS_PROOF_TYPES.find(t => t.value === kyc.address_proof_type)?.label}
        />
        {kyc.address_proof_path && <DocumentPreviewRow path={kyc.address_proof_path} />}

        {isPending && (
          <View style={styles.lockNote}>
            <Lock size={13} color={colors.textMuted} />
            <Text style={styles.lockNoteText}>
              Fields are locked while verification is in progress.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DocumentPreviewRow({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    getAddressProofSignedUrl(path).then(setUrl);
  }, [path]);

  return (
    <View style={styles.docRow}>
      <FileText size={16} color={colors.textSecondary} />
      <Text style={styles.docRowText}>{url ? 'Document uploaded' : 'Loading…'}</Text>
    </View>
  );
}

// ─── Step 0 — Legal Details ───────────────────────────────────────────────────

interface Step0State {
  registrationType: RegistrationType | null;
  addressLine:      string;
  city:             string;
  state:            string;
  pincode:          string;
}

function Step0LegalDetails({
  state,
  onChange,
}: {
  state:    Step0State;
  onChange: (patch: Partial<Step0State>) => void;
}) {
  const pincodeError = state.pincode.length > 0 && state.pincode.length < 6
    ? 'Pincode must be 6 digits.'
    : null;

  return (
    <View>
      <StepTitle
        eyebrow="Step 1 of 3"
        title="Legal Details"
        subtitle="Select your business registration type and operating address."
      />

      <Text style={styles.fieldLabel}>Registration Type</Text>
      <View style={styles.chipRow}>
        {REGISTRATION_TYPES.map(t => (
          <Pressable
            key={t.value}
            style={[styles.chip, state.registrationType === t.value && styles.chipSelected]}
            onPress={() => onChange({ registrationType: t.value })}
          >
            <Text style={[styles.chipText, state.registrationType === t.value && styles.chipTextSelected]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <OnboardingFocusedField
        label="Address Line"
        value={state.addressLine}
        onChangeText={v => onChange({ addressLine: v })}
        placeholder="123 MG Road"
        autoCapitalize="words"
      />
      <OnboardingFocusedField
        label="City"
        value={state.city}
        onChangeText={v => onChange({ city: v })}
        placeholder="Bengaluru"
        autoCapitalize="words"
      />
      <OnboardingFocusedField
        label="State"
        value={state.state}
        onChangeText={v => onChange({ state: v })}
        placeholder="Karnataka"
        autoCapitalize="words"
      />
      <OnboardingFocusedField
        label="Pincode"
        value={state.pincode}
        onChangeText={v => onChange({ pincode: v.replace(/\D/g, '').slice(0, 6) })}
        placeholder="560001"
        keyboardType="number-pad"
        maxLength={6}
        errorMessage={pincodeError}
      />
    </View>
  );
}

function isStep0Valid(s: Step0State): boolean {
  return !!s.registrationType
    && s.addressLine.trim().length > 0
    && s.city.trim().length > 0
    && s.state.trim().length > 0
    && s.pincode.length === 6;
}

// ─── Step 1 — Tax Credentials ─────────────────────────────────────────────────

interface Step1State {
  gstin:            string;
  pan:              string;
  gstNotApplicable: boolean;
  gstinValidated:   boolean;
  gstinValidating:  boolean;
  gstinError:       string | null;
  gstinRegistryName: string | null;
  gstCertUploading:    boolean;
  gstCertPath:         string | null;
  gstCertFileName:     string | null;
  gstCertUploadError:  string | null;
  panCardUploading:    boolean;
  panCardPath:         string | null;
  panCardFileName:     string | null;
  panCardUploadError:  string | null;
}

function Step1TaxCredentials({
  orgName,
  state,
  onChange,
  onValidateGstin,
  onPickGstCert,
  onPickPanCard,
}: {
  orgName:           string;
  state:             Step1State;
  onChange:          (patch: Partial<Step1State>) => void;
  onValidateGstin:   () => void;
  onPickGstCert:     () => void;
  onPickPanCard:     () => void;
}) {
  const gstinFormatValid = GSTIN_REGEX.test(state.gstin);
  const gstinFormatError =
    state.gstin.length === 15 && !gstinFormatValid
      ? 'Invalid GSTIN format. Expected e.g. 29ABCDE1234F1Z5.'
      : state.gstin.length > 0 && state.gstin.length < 15
      ? `${state.gstin.length}/15 characters — expected format: 29ABCDE1234F1Z5`
      : null;

  const gstinHint = state.gstinValidated
    ? `✓ Matched: ${state.gstinRegistryName ?? 'Active'}`
    : (state.gstinError || gstinFormatError)
    ? null
    : 'Enter 15-character GSTIN. We verify against the GST registry.';

  const panFormatValid = PAN_REGEX.test(state.pan);
  const panError =
    state.pan.length === 10 && !panFormatValid
      ? 'Invalid PAN format. Expected e.g. ABCDE1234F.'
      : state.pan.length > 0 && state.pan.length < 10
      ? `${state.pan.length}/10 characters — expected format: ABCDE1234F`
      : null;

  const incompleteReasons: string[] = [];
  if (!state.gstNotApplicable) {
    if (!state.gstinValidated) incompleteReasons.push('Verify your GSTIN');
    if (!state.gstCertPath) incompleteReasons.push('Upload GST registration certificate');
  }
  if (!panFormatValid) incompleteReasons.push('Enter a valid PAN');
  if (!state.panCardPath) incompleteReasons.push('Upload PAN card copy');

  return (
    <View>
      <StepTitle
        eyebrow="Step 2 of 3"
        title="Tax Credentials"
        subtitle="Your PAN and GSTIN are verified before submission."
      />

      {!state.gstNotApplicable && (
        <View>
          <OnboardingFocusedField
            label="GSTIN"
            value={state.gstin}
            onChangeText={v => {
              const next = v.toUpperCase().replace(/\s/g, '');
              if (next === state.gstin) return; // no real change — don't drop an already-verified state
              onChange({ gstin: next, gstinValidated: false, gstinError: null });
            }}
            placeholder="29ABCDE1234F1Z5"
            autoCapitalize="characters"
            maxLength={15}
            errorMessage={state.gstinError ?? gstinFormatError}
            hintMessage={state.gstinValidated ? gstinHint : (!state.gstinError && !gstinFormatError ? gstinHint : undefined)}
          />
          {gstinFormatValid && !state.gstinValidated && !state.gstinValidating && (
            <Pressable style={styles.validateButton} onPress={onValidateGstin}>
              <Text style={styles.validateButtonText}>Verify GSTIN →</Text>
            </Pressable>
          )}
          {state.gstinValidating && (
            <View style={styles.validatingRow}>
              <ActivityIndicator size="small" color={Theme.primary} />
              <Text style={styles.validatingText}>Checking GST registry…</Text>
            </View>
          )}
        </View>
      )}

      {!state.gstNotApplicable && (
        <DocumentUploadZone
          label="GST Registration Certificate"
          state={{
            uploading:    state.gstCertUploading,
            uploadedPath: state.gstCertPath,
            fileName:     state.gstCertFileName,
            uploadError:  state.gstCertUploadError,
          }}
          onPickFile={onPickGstCert}
        />
      )}

      <Pressable
        style={styles.gstToggleRow}
        onPress={() => onChange({ gstNotApplicable: !state.gstNotApplicable })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: state.gstNotApplicable }}
      >
        <View style={[styles.checkbox, state.gstNotApplicable && styles.checkboxChecked]}>
          {state.gstNotApplicable && <CheckCircle size={14} color={Theme.screenBackground} />}
        </View>
        <Text style={styles.gstToggleText}>
          I don't have a GSTIN (my business isn't registered for GST)
        </Text>
      </Pressable>

      <OnboardingFocusedField
        label="PAN (Permanent Account Number)"
        value={state.pan}
        onChangeText={v => onChange({ pan: v.toUpperCase().replace(/\s/g, '') })}
        placeholder="ABCDE1234F"
        autoCapitalize="characters"
        maxLength={10}
        errorMessage={panError}
        hintMessage={!panError ? '10-character PAN (e.g. ABCDE1234F)' : undefined}
      />

      <DocumentUploadZone
        label="PAN Card Copy"
        state={{
          uploading:    state.panCardUploading,
          uploadedPath: state.panCardPath,
          fileName:     state.panCardFileName,
          uploadError:  state.panCardUploadError,
        }}
        onPickFile={onPickPanCard}
      />

      {incompleteReasons.length > 0 && (
        <View style={styles.incompleteBanner}>
          <Text style={styles.incompleteBannerTitle}>To continue, you still need to:</Text>
          {incompleteReasons.map(reason => (
            <Text key={reason} style={styles.incompleteBannerItem}>• {reason}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function isStep1Valid(s: Step1State): boolean {
  const gstOk = s.gstNotApplicable || (s.gstinValidated && !!s.gstCertPath);
  return gstOk && PAN_REGEX.test(s.pan) && !!s.panCardPath;
}

// ─── Shared document upload zone ───────────────────────────────────────────────
// Same tap-to-upload control used for GST cert, PAN card, and address proof —
// factored out so picker/upload states render identically across doc types.

interface DocUploadZoneState {
  uploading:    boolean;
  uploadedPath: string | null;
  fileName:     string | null;
  uploadError:  string | null;
}

function DocumentUploadZone({
  label,
  state,
  onPickFile,
}: {
  label:      string;
  state:      DocUploadZoneState;
  onPickFile: () => void;
}) {
  return (
    <View style={styles.docUploadField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        style={[styles.uploadZone, state.uploadedPath ? styles.uploadZoneDone : null]}
        onPress={onPickFile}
        disabled={state.uploading}
      >
        {state.uploading ? (
          <>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.uploadZoneText}>Uploading…</Text>
          </>
        ) : state.uploadedPath ? (
          <>
            <CheckCircle size={20} color={Theme.success} />
            <Text style={styles.uploadZoneText}>{state.fileName ?? 'Document uploaded'}</Text>
            <Text style={styles.uploadZoneHint}>Tap to replace</Text>
          </>
        ) : (
          <>
            <Upload size={20} color={colors.textSecondary} />
            <Text style={styles.uploadZoneText}>Tap to upload</Text>
            <Text style={styles.uploadZoneHint}>JPG, PNG, or PDF · max 10 MB</Text>
          </>
        )}
      </Pressable>
      {state.uploadError ? (
        <Text style={styles.uploadError}>{state.uploadError}</Text>
      ) : null}
    </View>
  );
}

// ─── Step 2 — Address Proof Upload ───────────────────────────────────────────

interface Step2State {
  proofType:   AddressProofType | null;
  file:        AddressProofFile | null;
  fileName:    string | null;
  uploading:   boolean;
  uploadedPath: string | null;
  uploadError: string | null;
}

function Step2AddressProof({
  state,
  onChange,
  onPickFile,
}: {
  state:       Step2State;
  onChange:    (patch: Partial<Step2State>) => void;
  onPickFile:  () => void;
}) {
  return (
    <View>
      <StepTitle
        eyebrow="Step 3 of 3"
        title="Address Proof"
        subtitle="Upload a lease agreement or utility bill for your operating address."
      />

      <Text style={styles.fieldLabel}>Document Type</Text>
      <View style={styles.chipRow}>
        {ADDRESS_PROOF_TYPES.map(t => (
          <Pressable
            key={t.value}
            style={[styles.chip, state.proofType === t.value && styles.chipSelected]}
            onPress={() => onChange({ proofType: t.value })}
          >
            <Text style={[styles.chipText, state.proofType === t.value && styles.chipTextSelected]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.uploadZone, state.uploadedPath ? styles.uploadZoneDone : null]}
        onPress={onPickFile}
        disabled={state.uploading}
      >
        {state.uploading ? (
          <>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.uploadZoneText}>Uploading…</Text>
          </>
        ) : state.uploadedPath ? (
          <>
            <CheckCircle size={20} color={Theme.success} />
            <Text style={styles.uploadZoneText}>{state.fileName ?? 'Document uploaded'}</Text>
            <Text style={styles.uploadZoneHint}>Tap to replace</Text>
          </>
        ) : (
          <>
            <Upload size={20} color={colors.textSecondary} />
            <Text style={styles.uploadZoneText}>Tap to upload</Text>
            <Text style={styles.uploadZoneHint}>JPG, PNG, or PDF · max 10 MB</Text>
          </>
        )}
      </Pressable>

      {state.uploadError ? (
        <Text style={styles.uploadError}>{state.uploadError}</Text>
      ) : null}
    </View>
  );
}

function isStep2Valid(s: Step2State): boolean {
  return !!s.proofType && !!s.uploadedPath;
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function BusinessVerificationWizard({ onDone }: { onDone?: () => void }) {
  const { currentOrganization } = useOrganization();
  const orgId   = currentOrganization?.id  ?? '';
  const orgName = currentOrganization?.name ?? '';

  const [kyc,        setKyc]        = useState<WorkspaceKyc | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [step,       setStep]       = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [step0, setStep0] = useState<Step0State>({
    registrationType: null,
    addressLine:      '',
    city:             '',
    state:            '',
    pincode:          '',
  });

  const [step1, setStep1] = useState<Step1State>({
    gstin:             '',
    pan:               '',
    gstNotApplicable:  false,
    gstinValidated:    false,
    gstinValidating:   false,
    gstinError:        null,
    gstinRegistryName: null,
    gstCertUploading:    false,
    gstCertPath:         null,
    gstCertFileName:     null,
    gstCertUploadError:  null,
    panCardUploading:    false,
    panCardPath:         null,
    panCardFileName:     null,
    panCardUploadError:  null,
  });

  const [step2, setStep2] = useState<Step2State>({
    proofType:    null,
    file:         null,
    fileName:     null,
    uploading:    false,
    uploadedPath: null,
    uploadError:  null,
  });

  // Once the DB prefill + draft restore have both run, further state changes
  // should be persisted to the draft — guards against overwriting the draft
  // with the initial empty state while data is still loading.
  const draftReady = useRef(false);

  // Load current KYC state, then layer the local draft on top so unsaved
  // form fields (GSTIN/PAN/address, not yet pushed via updateWorkspaceKyc)
  // survive a refresh instead of appearing blank.
  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      getWorkspaceKyc(orgId),
      getVerificationDocuments(orgId),
      AsyncStorage.getItem(draftKey(orgId)),
    ]).then(([{ kyc: data }, { documents }, rawDraft]) => {
      if (data) {
        setKyc(data);
        // Pre-fill from existing data
        setStep0(s => ({
          ...s,
          registrationType: data.registration_type
            ?? BUSINESS_TYPE_TO_REGISTRATION[data.business_type ?? ''] ?? null,
          addressLine:      data.address_line       ?? '',
          city:             data.city               ?? '',
          state:            data.state              ?? '',
          pincode:          data.address_pincode ?? data.pincode ?? '',
        }));

        const gstCert = documents.find(d => d.document_type === 'gst_certificate');
        const panCard = documents.find(d => d.document_type === 'pan_card');
        setStep1(s => ({
          ...s,
          gstin: data.gstin            ?? '',
          pan:   data.business_pan     ?? '',
          gstNotApplicable: data.gst_not_applicable ?? false,
          gstinValidated: !!data.gstin, // treat as validated if already saved
          gstCertPath:     gstCert?.storage_path ?? null,
          gstCertFileName: gstCert ? 'Existing document' : null,
          panCardPath:     panCard?.storage_path ?? null,
          panCardFileName: panCard ? 'Existing document' : null,
        }));
        setStep2(s => ({
          ...s,
          proofType:    data.address_proof_type ?? null,
          uploadedPath: data.address_proof_path ?? null,
          fileName:     data.address_proof_path ? 'Existing document' : null,
        }));
      }

      if (rawDraft) {
        try {
          const draft = JSON.parse(rawDraft) as WizardDraft;
          setStep(draft.step ?? 0);
          setStep0(s => ({ ...s, ...draft.step0 }));
          setStep1(s => ({
            ...s,
            gstin: draft.gstin || s.gstin,
            pan:   draft.pan   || s.pan,
            // GSTIN text changed since last DB save — re-verify before continuing
            gstinValidated: draft.gstin && draft.gstin !== data?.gstin ? false : s.gstinValidated,
          }));
          setStep2(s => ({ ...s, proofType: draft.proofType ?? s.proofType }));
        } catch {
          // corrupt draft — ignore and fall back to DB-only state
        }
      }

      draftReady.current = true;
      setLoading(false);
    });
  }, [orgId]);

  // Persist draft form fields (not yet written to DB) so a refresh mid-flow
  // restores the same values instead of reverting to the last saved step.
  useEffect(() => {
    if (!orgId || !draftReady.current) return;
    const draft: WizardDraft = {
      step,
      step0,
      gstin: step1.gstin,
      pan:   step1.pan,
      proofType: step2.proofType,
    };
    AsyncStorage.setItem(draftKey(orgId), JSON.stringify(draft));
  }, [orgId, step, step0, step1.gstin, step1.pan, step2.proofType]);

  const handleValidateGstin = async () => {
    setStep1(s => ({ ...s, gstinValidating: true, gstinError: null }));
    const result = await validateGstin(step1.gstin, orgName);
    if (result.valid) {
      setStep1(s => ({
        ...s,
        gstinValidating:    false,
        gstinValidated:     true,
        gstinRegistryName:  result.status === 'ACTIVE' ? (result.registry_name ?? null) : null,
      }));
    } else {
      setStep1(s => ({
        ...s,
        gstinValidating:  false,
        gstinValidated:   false,
        gstinError:       result.message,
      }));
    }
  };

  type PickedAsset = { uri: string; mimeType?: string | null; fileName?: string | null; base64?: string | null };

  const pickDocumentAsset = (onPicked: (asset: PickedAsset) => void) => {
    // RN Web's Alert.alert only supports a single-button confirm — a
    // multi-option action sheet never renders, so "Tap to upload" would be a
    // silent no-op on web. Skip straight to the file picker there; it already
    // wraps a native <input type="file"> covering camera/gallery/file on
    // mobile browsers.
    if (Platform.OS === 'web') {
      DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true })
        .then(res => {
          if (!res.canceled && res.assets[0]) {
            const a = res.assets[0];
            onPicked({ uri: a.uri, mimeType: a.mimeType ?? 'application/pdf', fileName: a.name });
          }
        });
      return;
    }

    Alert.alert('Upload Document', 'Choose source', [
      {
        text:    'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permission required', 'Camera access is needed.'); return; }
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, base64: true });
          if (!res.canceled && res.assets[0]) onPicked(res.assets[0]);
        },
      },
      {
        text:    'Gallery',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permission required', 'Photo library access is needed.'); return; }
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'livePhotos'], quality: 0.85, base64: true });
          if (!res.canceled && res.assets[0]) onPicked(res.assets[0]);
        },
      },
      {
        text:    'PDF / File',
        onPress: async () => {
          const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
          if (!res.canceled && res.assets[0]) {
            const a = res.assets[0];
            onPicked({ uri: a.uri, mimeType: a.mimeType ?? 'application/pdf', fileName: a.name });
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handlePickFile = () => pickDocumentAsset(processPickedFile);

  const processPickedFile = async (asset: PickedAsset) => {
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const fileName = asset.fileName ?? `address-proof-${Date.now()}.jpg`;
    const file: AddressProofFile = {
      uri: asset.uri, mimeType, fileName, base64: asset.base64 ?? undefined,
    };

    setStep2(s => ({ ...s, uploading: true, uploadError: null, file, fileName }));
    const { path, error } = await uploadAddressProof(orgId, file, step2.proofType ?? undefined);
    if (error || !path) {
      setStep2(s => ({ ...s, uploading: false, uploadError: error?.message ?? 'Upload failed. Please try again.' }));
      return;
    }
    setStep2(s => ({ ...s, uploading: false, uploadedPath: path, uploadError: null }));
  };

  const handlePickGstCert = () => pickDocumentAsset(async asset => {
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const fileName = asset.fileName ?? `gst-certificate-${Date.now()}.jpg`;
    const file: VerificationDocumentFile = { uri: asset.uri, mimeType, fileName, base64: asset.base64 ?? undefined };

    console.log('%c[WIZARD] GST cert upload starting', 'color:#7c3aed', { fileName, mimeType, currentGstin: step1.gstin });
    setStep1(s => ({ ...s, gstCertUploading: true, gstCertUploadError: null }));
    const { path, error, verify } = await uploadVerificationDocument(orgId, 'gst_certificate', file, { gstin: step1.gstin });
    console.log('%c[WIZARD] GST cert upload finished', 'color:#7c3aed', { path, error: error?.message, verify });
    if (error || !path) {
      setStep1(s => ({ ...s, gstCertUploading: false, gstCertUploadError: error?.message ?? 'Upload failed. Please try again.' }));
      return;
    }
    // Auto-fill GSTIN from the document only if the field was still empty —
    // never overwrite something the user already typed.
    const extractedGstin = !step1.gstin.trim() ? verify?.extracted?.gstin ?? null : null;
    console.log('%c[WIZARD] GST autofill decision', 'color:#7c3aed', { currentGstin: step1.gstin, extractedGstin, willAutofill: !!extractedGstin });
    setStep1(s => ({
      ...s,
      gstCertUploading: false, gstCertPath: path, gstCertFileName: fileName, gstCertUploadError: null,
      ...(extractedGstin ? { gstin: extractedGstin, gstinValidated: false, gstinError: null } : null),
    }));
  });

  const handlePickPanCard = () => pickDocumentAsset(async asset => {
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const fileName = asset.fileName ?? `pan-card-${Date.now()}.jpg`;
    const file: VerificationDocumentFile = { uri: asset.uri, mimeType, fileName, base64: asset.base64 ?? undefined };

    console.log('%c[WIZARD] PAN card upload starting', 'color:#7c3aed', { fileName, mimeType, currentPan: step1.pan });
    setStep1(s => ({ ...s, panCardUploading: true, panCardUploadError: null }));
    const { path, error, verify } = await uploadVerificationDocument(orgId, 'pan_card', file, { pan: step1.pan });
    console.log('%c[WIZARD] PAN card upload finished', 'color:#7c3aed', { path, error: error?.message, verify });
    if (error || !path) {
      setStep1(s => ({ ...s, panCardUploading: false, panCardUploadError: error?.message ?? 'Upload failed. Please try again.' }));
      return;
    }
    const extractedPan = !step1.pan.trim() ? verify?.extracted?.pan ?? null : null;
    console.log('%c[WIZARD] PAN autofill decision', 'color:#7c3aed', { currentPan: step1.pan, extractedPan, willAutofill: !!extractedPan });
    setStep1(s => ({
      ...s,
      panCardUploading: false, panCardPath: path, panCardFileName: fileName, panCardUploadError: null,
      ...(extractedPan ? { pan: extractedPan } : null),
    }));
  });

  const handleNext = async () => {
    if (step === 0) {
      // Save address + registration type to org before advancing
      const { error } = await updateWorkspaceKyc(orgId, {
        address_line: step0.addressLine || null,
        city:         step0.city || null,
        state:        step0.state || null,
      });
      if (error) { Alert.alert('Could not save', error.message); return; }
      setStep(1);
      return;
    }
    if (step === 1) {
      // Save PAN + GSTIN via existing RPC before advancing
      const { error } = await updateWorkspaceKyc(orgId, {
        business_pan: step1.pan   || null,
        gstin:        step1.gstNotApplicable ? null : (step1.gstin || null),
        gst_not_applicable: step1.gstNotApplicable,
      });
      if (error) { Alert.alert('Could not save', error.message); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      await handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const { ok, error } = await submitBusinessVerification(orgId, {
      registration_type:  step0.registrationType ?? undefined,
      address_pincode:    step0.pincode   || undefined,
      address_proof_path: step2.uploadedPath ?? undefined,
      address_proof_type: step2.proofType   ?? undefined,
      gst_not_applicable: step1.gstNotApplicable,
    });
    setSubmitting(false);

    if (!ok || error) {
      Alert.alert('Submission Failed', error?.message ?? 'Could not submit. Please try again.');
      return;
    }

    await AsyncStorage.removeItem(draftKey(orgId));

    // Refresh KYC state to render frozen view
    const { kyc: refreshed } = await getWorkspaceKyc(orgId);
    if (refreshed) setKyc(refreshed);
    onDone?.();
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Theme.primary} />
      </View>
    );
  }

  // If frozen (pending or verified) → read-only view
  if (kyc && isVerificationFrozen(kyc.verification_status)) {
    return <FrozenStatusView kyc={kyc} />;
  }

  const currentStepValid =
    step === 0 ? isStep0Valid(step0) :
    step === 1 ? isStep1Valid(step1) :
    isStep2Valid(step2);

  return (
    <View style={styles.root}>
      {/* Progress rail */}
      <View style={styles.progressRail}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View
            key={i}
            style={[styles.progressSegment, i <= step ? styles.progressSegmentActive : null]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <Step0LegalDetails
            state={step0}
            onChange={patch => setStep0(s => ({ ...s, ...patch }))}
          />
        )}
        {step === 1 && (
          <Step1TaxCredentials
            orgName={orgName}
            state={step1}
            onChange={patch => setStep1(s => ({ ...s, ...patch }))}
            onValidateGstin={handleValidateGstin}
            onPickGstCert={handlePickGstCert}
            onPickPanCard={handlePickPanCard}
          />
        )}
        {step === 2 && (
          <Step2AddressProof
            state={step2}
            onChange={patch => setStep2(s => ({ ...s, ...patch }))}
            onPickFile={handlePickFile}
          />
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && (
          <Pressable style={styles.backButton} onPress={() => setStep(s => s - 1)}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        )}
        <OperationalButton
          intent="primary"
          label={step === TOTAL_STEPS - 1 ? 'Submit for Verification' : 'Continue'}
          onPress={handleNext}
          disabled={!currentStepValid || submitting}
          loading={submitting}
          fullWidth={step === 0}
        />
      </View>
    </View>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StepTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={styles.stepTitleBlock}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepSubtitle}>{subtitle}</Text>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

function ReadRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.readRow}>
      <Text style={styles.readRowLabel}>{label}</Text>
      <Text style={styles.readRowValue}>{value}</Text>
    </View>
  );
}

function formatRejectionReason(r: string): string {
  return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: Theme.screenBackground },
  loader:         { flex: 1, justifyContent: 'center', alignItems: 'center' },

  progressRail:   { flexDirection: 'row', gap: 4, paddingHorizontal: space[5], paddingTop: space[4] },
  progressSegment:{
    flex: 1, height: 3, borderRadius: 2,
    backgroundColor: Theme.surfaceBorder,
  },
  progressSegmentActive: { backgroundColor: Theme.primary },

  scrollContent:  { padding: space[5], paddingBottom: space[8] },

  stepTitleBlock: { marginBottom: space[6] },
  eyebrow:        { ...typography.label, fontSize: 10, color: colors.textMuted, marginBottom: space[1] },
  stepTitle:      { fontSize: 22, fontWeight: '700', color: Theme.primaryText, marginBottom: space[2] },
  stepSubtitle:   { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  fieldLabel:     { ...typography.label, fontSize: 10, color: colors.textSecondary, marginBottom: space[2] },

  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[5] },
  chip:           {
    paddingHorizontal: space[3],
    paddingVertical:   space[2],
    borderRadius:      radius.sm,
    borderWidth:       StyleSheet.hairlineWidth,
    borderColor:       colors.borderDefault,
    backgroundColor:   Theme.surface,
  },
  chipSelected:   {
    backgroundColor: Theme.primary,
    borderColor:     Theme.primary,
  },
  chipText:       { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  chipTextSelected: { color: Theme.screenBackground },

  validateButton: { alignSelf: 'flex-end', marginTop: -space[3], marginBottom: space[3] },
  validateButtonText: { fontSize: 13, fontWeight: '600', color: Theme.primary },

  validatingRow:  { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[3] },
  validatingText: { fontSize: 13, color: colors.textSecondary },

  gstToggleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           space[3],
    marginBottom:  space[5],
  },
  checkbox: {
    width:           20,
    height:          20,
    borderRadius:    radius.sm,
    borderWidth:     1.5,
    borderColor:     colors.borderDefault,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Theme.surface,
  },
  checkboxChecked: {
    backgroundColor: Theme.primary,
    borderColor:     Theme.primary,
  },
  gstToggleText: {
    flex:     1,
    fontSize: 13,
    color:    colors.textSecondary,
  },

  docUploadField: { marginBottom: space[4] },
  incompleteBanner: {
    backgroundColor: '#fffbeb',
    borderWidth:     1,
    borderColor:     '#fde68a',
    borderRadius:    radius.md,
    padding:         space[4],
    marginTop:       space[2],
  },
  incompleteBannerTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: space[2] },
  incompleteBannerItem:  { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  uploadZone: {
    borderWidth:     1.5,
    borderStyle:     'dashed',
    borderColor:     colors.borderDefault,
    borderRadius:    radius.md,
    paddingVertical: space[6],
    alignItems:      'center',
    gap:             space[2],
    backgroundColor: Theme.surface,
    marginBottom:    space[4],
  },
  uploadZoneDone: {
    borderStyle:     'solid',
    borderColor:     Theme.success,
    backgroundColor: '#f0fdf4',
  },
  uploadZoneText: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  uploadZoneHint: { fontSize: 12, color: colors.textMuted },
  uploadError:    { fontSize: 12, color: colors.cost, marginTop: -space[3], marginBottom: space[3] },

  footer: {
    flexDirection:  'row',
    gap:            space[3],
    paddingHorizontal: space[5],
    paddingBottom:  space[6],
    paddingTop:     space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.screenBackground,
  },
  backButton: {
    justifyContent: 'center',
    paddingHorizontal: space[4],
  },
  backButtonText: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },

  // Frozen / read-only styles
  statusCard: {
    backgroundColor: Theme.surface,
    borderRadius:    radius.lg,
    padding:         space[5],
    marginBottom:    space[5],
    alignItems:      'center',
    gap:             space[2],
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     Theme.surfaceBorder,
  },
  statusIconRow:  { marginBottom: space[1] },
  statusTitle:    { fontSize: 18, fontWeight: '700', color: Theme.primaryText, textAlign: 'center' },
  statusMessage:  { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  rejectionList:  { marginTop: space[2], alignSelf: 'flex-start', width: '100%' },
  rejectionItem:  { fontSize: 13, color: colors.cost, marginVertical: 2 },

  sectionHeader: {
    fontSize:      10,
    fontWeight:    '700',
    color:         colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop:     space[5],
    marginBottom:  space[2],
  },
  readRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  readRowLabel: { fontSize: 13, color: colors.textSecondary },
  readRowValue: { fontSize: 13, fontWeight: '500', color: Theme.primaryText, maxWidth: '60%', textAlign: 'right' },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[3] },
  docRowText: { fontSize: 13, color: colors.textSecondary },

  lockNote: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           space[2],
    marginTop:     space[5],
    padding:       space[3],
    backgroundColor: Theme.surface,
    borderRadius:    radius.sm,
  },
  lockNoteText: { fontSize: 12, color: colors.textMuted, flex: 1 },
});
