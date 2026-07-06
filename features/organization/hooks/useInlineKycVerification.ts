import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  getOrgProfileFields,
  getWorkspaceKyc,
  updateWorkspaceKyc,
  type OrgProfileFields,
} from '@/features/organization/services/organization.service';
import { updateOrganizationWorkspaceProfile } from '@/features/organization/services/organizationWorkspaceProfile.service';
import {
  saveVerificationDraft,
  submitBusinessVerification,
  validateGstin,
} from '@/features/organization/services/businessVerification.service';
import {
  listOrganizationKycDocuments,
  removeOrganizationKycDocument,
  upsertOrganizationKycDocument,
} from '@/features/organization/services/organizationKycDocuments.service';
import { pickAndUploadVerificationDocument } from '@/features/organization/utils/kycDocumentUpload.util';
import { kycVerificationReady } from '@/features/organization/utils/kycVerification.util';
import type { OrganizationKycDocType } from '@/features/organization/types/organizationKycDocuments.types';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { KycField } from '@/features/organization/components/workspace/workspacePanelUi';
import type { AddressProofType, RegistrationType, WorkspaceKyc } from '@/types/organization';
import { isVerificationFrozen } from '@/types/organization';

export function useInlineKycVerification(orgId: string, orgName: string) {
  const [kyc, setKyc] = useState<WorkspaceKyc | null>(null);
  const [documents, setDocuments] = useState<OrganizationKycDocument[]>([]);
  const [orgProfile, setOrgProfile] = useState<OrgProfileFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState<OrganizationKycDocType | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) return;
    const [{ kyc: kycData }, { profile }, { documents: docRows }] = await Promise.all([
      getWorkspaceKyc(orgId),
      getOrgProfileFields(orgId),
      listOrganizationKycDocuments(orgId),
    ]);
    if (kycData) setKyc(kycData);
    if (profile) setOrgProfile(profile);
    setDocuments(docRows);
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const frozen = isVerificationFrozen(kyc?.verification_status ?? 'unverified');
  const canSubmit =
    !frozen &&
    (kyc?.verification_status === 'unverified' || kyc?.verification_status === 'rejected') &&
    kycVerificationReady(kyc, documents);

  const saveKycField = useCallback(
    async (field: KycField, val: string) => {
      if (!orgId) return { error: new Error('No workspace') };
      const { kyc: updated, error } = await updateWorkspaceKyc(orgId, { [field]: val || null });
      if (!error && updated) setKyc(updated);
      return { error };
    },
    [orgId],
  );

  const validateGstinField = useCallback(
    async (gstin: string) => {
      const result = await validateGstin(gstin, orgName);
      if (!result.valid) {
        return { ok: false as const, message: result.message };
      }
      const save = await saveKycField('gstin', gstin);
      if (save.error) return { ok: false as const, message: save.error.message };
      return {
        ok: true as const,
        registryName: result.status === 'ACTIVE' ? result.registry_name : undefined,
      };
    },
    [orgName, saveKycField],
  );

  const saveRegistrationType = useCallback(
    async (registrationType: RegistrationType) => {
      if (!orgId) return { error: new Error('No workspace') };
      const { error } = await saveVerificationDraft(orgId, { registration_type: registrationType });
      if (!error) await reload();
      return { error };
    },
    [orgId, reload],
  );

  const saveOperatingAddress = useCallback(
    async (input: {
      address_line: string;
      city: string;
      state: string;
      address_pincode: string;
    }) => {
      if (!orgId) return { error: new Error('No workspace') };
      const [{ error: draftErr }, { error: profileErr }] = await Promise.all([
        saveVerificationDraft(orgId, {
          address_line: input.address_line,
          city: input.city,
          state: input.state,
          address_pincode: input.address_pincode,
        }),
        updateOrganizationWorkspaceProfile(orgId, {
          address_line: input.address_line,
          city: input.city,
          state: input.state,
          pincode: input.address_pincode,
        }),
      ]);
      const error = draftErr ?? profileErr;
      if (!error) await reload();
      return { error: error ?? null };
    },
    [orgId, reload],
  );

  const saveWebsite = useCallback(
    async (website: string) => {
      if (!orgId) return { error: new Error('No workspace') };
      const { error } = await updateOrganizationWorkspaceProfile(orgId, {
        profile_website: website,
      });
      if (!error) {
        const { profile } = await getOrgProfileFields(orgId);
        if (profile) setOrgProfile(profile);
      }
      return { error };
    },
    [orgId],
  );

  const uploadKycDocument = useCallback(
    async (docType: OrganizationKycDocType, proofType?: AddressProofType) => {
      if (!orgId || uploadingDocType) return { error: new Error('Busy') };
      if (docType === 'address_proof' && !proofType) {
        return { error: new Error('Select address proof type first.') };
      }
      setUploadingDocType(docType);
      try {
        const picked = await pickAndUploadVerificationDocument(orgId, docType);
        if (!picked) return { error: null };

        const { document, error: upsertErr } = await upsertOrganizationKycDocument(orgId, {
          doc_type: docType,
          storage_path: picked.path,
          file_name: picked.fileName,
          mime_type: picked.mimeType,
          file_size_bytes: picked.sizeBytes,
          is_mandatory: true,
        });
        if (upsertErr) return { error: upsertErr };

        if (docType === 'address_proof' && proofType) {
          const { error: draftErr } = await saveVerificationDraft(orgId, {
            address_proof_path: picked.path,
            address_proof_type: proofType,
          });
          if (draftErr) return { error: draftErr };
        }

        if (document) {
          setDocuments((prev) => {
            const rest = prev.filter((d) => d.doc_type !== docType);
            return [...rest, document];
          });
        }
        await reload();
        return { error: null };
      } finally {
        setUploadingDocType(null);
      }
    },
    [orgId, uploadingDocType, reload],
  );

  const removeKycDocument = useCallback(
    async (docType: OrganizationKycDocType) => {
      if (!orgId) return { error: new Error('No workspace') };
      const { error } = await removeOrganizationKycDocument(orgId, docType);
      if (error) return { error };

      if (docType === 'address_proof') {
        const { error: draftErr } = await saveVerificationDraft(orgId, {
          address_proof_path: null,
          address_proof_type: null,
        });
        if (draftErr) return { error: draftErr };
      }

      setDocuments((prev) => prev.filter((d) => d.doc_type !== docType));
      await reload();
      return { error: null };
    },
    [orgId, reload],
  );

  const submitForVerification = useCallback(async () => {
    if (!orgId || !kyc || submitting) return { ok: false, error: new Error('Busy') };
    if (!kycVerificationReady(kyc, documents)) {
      return { ok: false, error: new Error('Complete all required fields before submitting.') };
    }
    setSubmitting(true);
    try {
      const { ok, error } = await submitBusinessVerification(orgId, {
        registration_type: kyc.registration_type ?? undefined,
        address_pincode: kyc.address_pincode ?? undefined,
        address_proof_path: kyc.address_proof_path ?? undefined,
        address_proof_type: kyc.address_proof_type ?? undefined,
      });
      if (!ok || error) {
        Alert.alert('Submission failed', error?.message ?? 'Could not submit for verification.');
        return { ok: false, error: error ?? new Error('Submit failed') };
      }
      await reload();
      Alert.alert(
        'Submitted for review',
        'Your business profile is under verification. Fields are locked until review completes.',
      );
      return { ok: true, error: null };
    } finally {
      setSubmitting(false);
    }
  }, [documents, kyc, orgId, reload, submitting]);

  return {
    kyc,
    documents,
    orgProfile,
    loading,
    submitting,
    uploadingDocType,
    frozen,
    canSubmit,
    reload,
    saveKycField,
    validateGstinField,
    saveRegistrationType,
    saveOperatingAddress,
    saveWebsite,
    uploadKycDocument,
    removeKycDocument,
    submitForVerification,
  };
}
