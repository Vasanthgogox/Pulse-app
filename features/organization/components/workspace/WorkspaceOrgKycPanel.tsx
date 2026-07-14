/**
 * Org identity & KYC — inline Groww-style document-level verification on one page.
 */
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useInlineKycVerification } from '@/features/organization/hooks/useInlineKycVerification';
import { WorkspaceDetailLayout } from '@/features/organization/components/workspace/WorkspaceDetailLayout';
import { useWorkspaceFeedback } from '@/features/organization/components/workspace/WorkspaceFeedbackProvider';
import { WORKSPACE_PANEL_TITLES } from '@/features/organization/components/workspace/workspacePanelTypes';
import { KycRequiredDocumentsSection } from '@/features/organization/components/workspace/kyc/KycRequiredDocumentsSection';
import {
  KycOperatingAddressRow,
  KycRegistrationTypeRow,
  KycWebsiteRow,
} from '@/features/organization/components/workspace/kyc/KycBusinessDetailRows';
import { InlineVerificationStatusBanner } from '@/features/organization/components/workspace/kyc/InlineVerificationStatusBanner';
import { KycSubmitFooter } from '@/features/organization/components/workspace/kyc/KycSubmitFooter';
import {
  AMBER,
  GREEN,
  InfoRow,
  KycFieldsList,
  KycProgressBlock,
  kycCompletionPct,
  modelLabel,
  orgInitials,
  OrgIdCopyRow,
  SectionHeader,
  workspacePanelStyles as styles,
  type KycField,
} from '@/features/organization/components/workspace/workspacePanelUi';
import {
  kycBusinessDetailsProgressPct,
  kycDocumentsProgressPct,
  kycStructureRequirementsHint,
  registrationTypeLabel,
} from '@/features/organization/utils/kycVerification.util';
import { useOrgRole } from '@/lib/hooks/useOrgRole';
import * as Clipboard from 'expo-clipboard';
import { Lock } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

type Props = {
  onBack: () => void;
};

export function WorkspaceOrgKycPanel({ onBack }: Props) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { canEdit } = useOrgRole();
  const { notice } = useWorkspaceFeedback();

  const orgId = currentOrganization?.id ?? '';
  const orgName = currentOrganization?.name ?? '';

  const {
    kyc,
    documents,
    orgProfile,
    loading,
    submitting,
    uploadingDocType,
    frozen,
    canSubmit,
    submitGaps,
    saveKycField,
    setGstNotApplicable,
    validateGstinField,
    saveRegistrationType,
    saveOperatingAddress,
    saveWebsite,
    uploadKycDocument,
    removeKycDocument,
    submitForVerification,
  } = useInlineKycVerification(orgId, orgName);

  const [copying, setCopying] = useState(false);

  const handleCopyOrgId = async () => {
    if (!orgId || copying) return;
    setCopying(true);
    try {
      await Clipboard.setStringAsync(orgId);
      notice({ kind: 'success', title: 'Workspace ID copied', duration: 2000 });
      setTimeout(() => setCopying(false), 1400);
    } catch {
      setCopying(false);
      notice({
        kind: 'error',
        title: "Couldn't copy",
        message: 'Clipboard access was denied.',
      });
    }
  };

  const handleSaveKycField = useCallback(
    async (field: KycField, val: string) => {
      const { error } = await saveKycField(field, val);
      if (error) {
        notice({ kind: 'error', title: 'Save failed', message: error.message });
        return;
      }
      notice({
        kind: 'success',
        title: val ? 'Field saved' : 'Field cleared',
        duration: 2400,
      });
    },
    [notice, saveKycField],
  );

  const handleSetGstNotApplicable = useCallback(
    async (notApplicable: boolean) => {
      const { error } = await setGstNotApplicable(notApplicable);
      if (error) {
        notice({ kind: 'error', title: 'Save failed', message: error.message });
        return;
      }
      notice({
        kind: 'success',
        title: notApplicable
          ? 'Marked as not registered for GST'
          : 'GSTIN required again',
        duration: 2400,
      });
    },
    [notice, setGstNotApplicable],
  );

  const handleValidateGstin = useCallback(
    async (gstin: string) => {
      const result = await validateGstinField(gstin);
      if (result.ok) {
        notice({ kind: 'success', title: 'GSTIN verified', duration: 2400 });
      }
      return result;
    },
    [notice, validateGstinField],
  );

  const taxPct = kycCompletionPct(kyc);
  const taxBarColor = taxPct === 100 ? GREEN : taxPct > 0 ? AMBER : Theme.negative;
  const taxAccent = taxPct === 100 ? GREEN : AMBER;

  const businessPct = kycBusinessDetailsProgressPct(kyc, orgProfile?.profile_website);
  const docsPct = kycDocumentsProgressPct(documents, kyc);
  const businessBarColor = businessPct === 100 ? GREEN : businessPct > 0 ? AMBER : Theme.negative;
  const businessAccent = businessPct === 100 ? GREEN : AMBER;

  if (loading && !kyc) {
    return (
      <WorkspaceDetailLayout
        title={WORKSPACE_PANEL_TITLES.kyc}
        subtitle={orgName || 'Organisation'}
        onBack={onBack}
      >
        <CenteredLoadingView />
      </WorkspaceDetailLayout>
    );
  }

  return (
    <WorkspaceDetailLayout
      title={WORKSPACE_PANEL_TITLES.kyc}
      subtitle={orgName || 'Organisation'}
      onBack={onBack}
      footerSlot={
        canEdit && !frozen ? (
          <KycSubmitFooter
            canSubmit={canSubmit}
            submitting={submitting}
            missingItems={submitGaps}
            structureLabel={registrationTypeLabel(kyc?.registration_type) || null}
            structureHint={kycStructureRequirementsHint(
              kyc?.registration_type,
              !!kyc?.gst_not_applicable,
            )}
            onSubmit={() => void submitForVerification()}
          />
        ) : null
      }
    >
      <View style={styles.panelStack}>
        <InlineVerificationStatusBanner kyc={kyc} documents={documents} />

        <View style={styles.detailCard}>
          <SectionHeader
            label="Tax & compliance IDs"
            color={taxAccent}
            trailing={<KycProgressBlock pct={taxPct} barColor={taxBarColor} inline />}
          />
          {!canEdit ? (
            <View style={styles.kycReadonlyNote}>
              <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.kycReadonlyText}>
                Only admins and owners can edit KYC fields.
              </Text>
            </View>
          ) : frozen ? (
            <View style={styles.kycReadonlyNote}>
              <Lock size={10} color={Theme.textMuted} strokeWidth={2} />
              <Text style={styles.kycReadonlyText}>
                Profile is locked while verification is in progress or approved.
              </Text>
            </View>
          ) : null}
          <KycFieldsList
            kyc={kyc}
            canEdit={canEdit && !frozen}
            onSave={handleSaveKycField}
            onValidateGstin={handleValidateGstin}
            onSetGstNotApplicable={handleSetGstNotApplicable}
          />
        </View>

        <View style={styles.detailCard}>
          <SectionHeader
            label="Verification documents"
            color={docsPct === 100 ? GREEN : docsPct > 0 ? AMBER : Theme.negative}
            trailing={
              <KycProgressBlock
                pct={docsPct}
                barColor={docsPct === 100 ? GREEN : docsPct > 0 ? AMBER : Theme.negative}
                inline
              />
            }
          />
          <KycRequiredDocumentsSection
            kyc={kyc}
            documents={documents}
            canEdit={canEdit}
            frozen={frozen}
            uploadingDocType={uploadingDocType}
            onUpload={async (docType, proofType) => {
              const result = await uploadKycDocument(docType, proofType);
              if (result.cancelled) return;
              if (result.error) {
                notice({
                  kind: 'error',
                  title: 'Upload failed',
                  message: result.error.message,
                });
                return;
              }
              notice({ kind: 'success', title: 'Document uploaded', duration: 2400 });
            }}
            onRemove={async (docType) => {
              const { error } = await removeKycDocument(docType);
              if (error) {
                notice({ kind: 'error', title: 'Remove failed', message: error.message });
              }
            }}
          />
        </View>

        <View style={styles.detailCard}>
          <SectionHeader
            label="Business details"
            color={businessAccent}
            trailing={
              <KycProgressBlock pct={businessPct} barColor={businessBarColor} inline />
            }
          />
          <KycRegistrationTypeRow
            kyc={kyc}
            canEdit={canEdit}
            frozen={frozen}
            onSave={saveRegistrationType}
          />
          <KycOperatingAddressRow
            kyc={kyc}
            canEdit={canEdit}
            frozen={frozen}
            onSave={saveOperatingAddress}
          />
          <KycWebsiteRow
            website={orgProfile?.profile_website ?? ''}
            canEdit={canEdit}
            frozen={frozen}
            onSave={saveWebsite}
          />
        </View>

        <View style={styles.detailCard}>
          <SectionHeader label="Org identity" />
          <OrgIdCopyRow
            orgId={orgId}
            copying={copying}
            onCopy={() => void handleCopyOrgId()}
          />
          <InfoRow
            label="Operating model"
            value={modelLabel(currentOrganization?.operatingModel)}
          />
          {user?.email ? <InfoRow label="Owner email" value={user.email} /> : null}
          <InfoRow
            label="Display name"
            value={orgName || orgInitials(orgName)}
          />
        </View>
      </View>
    </WorkspaceDetailLayout>
  );
}
