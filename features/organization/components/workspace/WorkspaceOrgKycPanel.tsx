/**
 * Organization hub — summary home plus Business details / Verification / Documents.
 * KYC is a guided destination, not the landing page.
 */
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useInlineKycVerification } from '@/features/organization/hooks/useInlineKycVerification';
import { WorkspaceDetailLayout } from '@/features/organization/components/workspace/WorkspaceDetailLayout';
import { useWorkspaceFeedback } from '@/features/organization/components/workspace/WorkspaceFeedbackProvider';
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
  type OrgHubSection,
  type WorkspacePanelId,
} from '@/features/organization/components/workspace/workspacePanelTypes';
import { KycDocumentUpdateWizard } from '@/features/organization/components/workspace/kyc/KycDocumentUpdateWizard';
import { OrganizationHomePanel } from '@/features/organization/components/workspace/org/OrganizationHomePanel';
import { OrganizationBusinessDetailsPanel } from '@/features/organization/components/workspace/org/OrganizationBusinessDetailsPanel';
import { OrganizationVerificationPanel } from '@/features/organization/components/workspace/org/OrganizationVerificationPanel';
import { OrganizationDocumentsPanel } from '@/features/organization/components/workspace/org/OrganizationDocumentsPanel';
import { OrganizationVerifyWizard } from '@/features/organization/components/workspace/org/OrganizationVerifyWizard';
import type { OrganizationKycDocDefinition } from '@/features/organization/types/organizationKycDocuments.types';
import { useOrgRole } from '@/lib/hooks/useOrgRole';
import { useMemberAccess } from '@/lib/useMemberAccess';
import { useCallback, useState } from 'react';

type Props = {
  onBack: () => void;
  section?: OrgHubSection | null;
  onOpenSection: (section: OrgHubSection | null) => void;
  onOpenPanel: (panel: WorkspacePanelId) => void;
};

const SECTION_TITLES: Record<OrgHubSection, string> = {
  details: 'Business details',
  verification: 'Verification',
  documents: 'Documents',
};

export function WorkspaceOrgKycPanel({
  onBack,
  section = null,
  onOpenSection,
  onOpenPanel,
}: Props) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { canEdit } = useOrgRole();
  const { can } = useMemberAccess();
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
    pickKycDocumentFile,
    commitKycDocumentUpdate,
    removeKycDocument,
    submitForVerification,
  } = useInlineKycVerification(orgId, orgName);

  const [updateDef, setUpdateDef] = useState<OrganizationKycDocDefinition | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const handleSaveKycField = useCallback(
    async (field: Parameters<typeof saveKycField>[0], val: string) => {
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

  const handleWizardPick = useCallback(
    async (
      docType: OrganizationKycDocDefinition['type'],
      proofType?: Parameters<typeof pickKycDocumentFile>[1],
    ) => {
      setWizardError(null);
      const result = await pickKycDocumentFile(docType, proofType);
      if (result.cancelled) return null;
      if (result.error) {
        setWizardError(result.error.message);
        return null;
      }
      return result.document;
    },
    [pickKycDocumentFile],
  );

  const handleWizardConfirm = useCallback(
    async (
      picked: Parameters<typeof commitKycDocumentUpdate>[0],
      docType: OrganizationKycDocDefinition['type'],
      proofType?: Parameters<typeof commitKycDocumentUpdate>[2],
    ) => {
      setWizardError(null);
      const { error } = await commitKycDocumentUpdate(picked, docType, proofType);
      if (error) {
        setWizardError(error.message);
        return false;
      }
      const onboardingDraft = kyc?.verification_status === 'unverified';
      notice({
        kind: 'success',
        title: onboardingDraft ? 'Document saved' : 'Sent for admin review',
        message: onboardingDraft
          ? 'This file is part of your application. Submit from Review when you are ready.'
          : 'Only the new document is queued. Admins will review it in the console.',
        duration: 2800,
      });
      return true;
    },
    [commitKycDocumentUpdate, kyc?.verification_status, notice],
  );

  const openUpdate = useCallback((definition: OrganizationKycDocDefinition) => {
    setWizardError(null);
    setUpdateDef(definition);
  }, []);

  const handleRemoveDocument = useCallback(
    async (docType: OrganizationKycDocDefinition['type']) => {
      const { error } = await removeKycDocument(docType);
      if (error) {
        notice({ kind: 'error', title: 'Could not remove document', message: error.message });
        return;
      }
      notice({ kind: 'success', title: 'Document removed', duration: 2400 });
    },
    [notice, removeKycDocument],
  );

  const status = kyc?.verification_status ?? 'unverified';
  const isDraft = status === 'unverified' || status === 'rejected';
  const title = section ? SECTION_TITLES[section] : WORKSPACE_PANEL_TITLES.kyc;
  const subtitle = section
    ? orgName || 'Organisation'
    : WORKSPACE_PANEL_SUBTITLES.kyc ?? orgName;
  const handleBack = section ? () => onOpenSection(null) : onBack;

  const startVerify = useCallback(() => {
    if (!canEdit || !isDraft) return;
    setVerifyOpen(true);
  }, [canEdit, isDraft]);

  const wizard = (
    <KycDocumentUpdateWizard
      key={updateDef ? `${updateDef.type}-${updateDef.label}` : 'closed'}
      visible={!!updateDef}
      definition={updateDef}
      hasExistingDocument={
        !!updateDef &&
        (documents.some(
          (d) =>
            !!d.storage_path &&
            (d.doc_type === updateDef.type ||
              !!updateDef.acceptTypes?.includes(d.doc_type) ||
              !!updateDef.uploadChoices?.includes(d.doc_type)),
        ) ||
          (updateDef.type === 'address_proof' && !!kyc?.address_proof_path?.trim()))
      }
      uploading={!!uploadingDocType}
      submitting={submitting}
      formError={wizardError}
      variant={verifyOpen && status === 'unverified' ? 'onboarding' : 'update'}
      onClose={() => {
        setUpdateDef(null);
        setWizardError(null);
      }}
      onPick={handleWizardPick}
      onConfirm={handleWizardConfirm}
    />
  );

  if (loading && !kyc) {
    return (
      <WorkspaceDetailLayout title={title} subtitle={subtitle} onBack={handleBack}>
        <CenteredLoadingView />
      </WorkspaceDetailLayout>
    );
  }

  if (verifyOpen) {
    return (
      <>
        <OrganizationVerifyWizard
          orgName={orgName}
          kyc={kyc}
          documents={documents}
          canEdit={canEdit}
          frozen={frozen}
          canSubmit={canSubmit}
          submitGaps={submitGaps}
          submitting={submitting}
          uploadingDocType={uploadingDocType}
          onSaveRegistrationType={saveRegistrationType}
          onSaveOperatingAddress={saveOperatingAddress}
          onSaveKycField={handleSaveKycField}
          onValidateGstin={handleValidateGstin}
          onSetGstNotApplicable={handleSetGstNotApplicable}
          onOpenUpdate={openUpdate}
          onRemoveDocument={handleRemoveDocument}
          onSubmit={submitForVerification}
          onExit={() => setVerifyOpen(false)}
          onComplete={() => {
            setVerifyOpen(false);
            onOpenSection('verification');
          }}
        />
        {wizard}
      </>
    );
  }

  const body = !section ? (
    <OrganizationHomePanel
      orgName={orgName}
      organization={currentOrganization}
      kyc={kyc}
      documents={documents}
      canEdit={canEdit}
      showMembers={can('team.manage')}
      showPreferences={can('workspace.settings')}
      onOpenSection={onOpenSection}
      onStartVerify={startVerify}
      onOpenMembers={() => onOpenPanel('team')}
      onOpenPreferences={() => onOpenPanel('settings')}
    />
  ) : section === 'details' ? (
    <OrganizationBusinessDetailsPanel
      orgName={orgName}
      organization={currentOrganization}
      kyc={kyc}
      orgProfile={orgProfile}
      ownerEmail={user?.email ?? null}
      canEdit={canEdit}
      frozen={frozen}
      onSaveRegistrationType={saveRegistrationType}
      onSaveOperatingAddress={saveOperatingAddress}
      onSaveWebsite={saveWebsite}
    />
  ) : section === 'verification' ? (
    <OrganizationVerificationPanel
      kyc={kyc}
      documents={documents}
      canEdit={canEdit}
      onOpenDocuments={() => onOpenSection('documents')}
      onOpenUpdate={openUpdate}
      onStartVerify={startVerify}
    />
  ) : (
    <OrganizationDocumentsPanel
      kyc={kyc}
      documents={documents}
      canEdit={canEdit}
      frozen={frozen}
      uploadingDocType={uploadingDocType}
      onOpenUpdate={openUpdate}
      onRemove={(docType) => void handleRemoveDocument(docType)}
    />
  );

  return (
    <WorkspaceDetailLayout
      title={title}
      subtitle={subtitle}
      onBack={handleBack}
    >
      {body}
      {wizard}
    </WorkspaceDetailLayout>
  );
}
