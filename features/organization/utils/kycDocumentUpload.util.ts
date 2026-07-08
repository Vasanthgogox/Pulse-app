import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import {
  uploadVerificationDocument,
  type AddressProofFile,
  type VerificationDocumentType,
} from '@/features/organization/services/businessVerification.service';
import type { OrganizationKycDocType } from '@/features/organization/types/organizationKycDocuments.types';
import type { AddressProofType } from '@/types/organization';

export type PickedVerificationDocument = {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  extractedGstin?: string | null;
  extractedPan?: string | null;
};

/** address_proof has no single enum member — it maps to one of three
 * sub-types based on what the user picked in the document-type chips. */
function resolveVerificationDocumentType(
  docType: OrganizationKycDocType,
  addressProofType?: AddressProofType,
): VerificationDocumentType | null {
  if (docType === 'address_proof') {
    switch (addressProofType) {
      case 'lease': return 'address_proof_lease';
      case 'utility_bill': return 'address_proof_utility_bill';
      default: return 'address_proof_other';
    }
  }
  if (
    docType === 'gst_certificate' ||
    docType === 'pan_card' ||
    docType === 'cin_certificate' ||
    docType === 'msme_certificate'
  ) {
    return docType;
  }
  return null; // iec_certificate / incorporation_certificate / other: not yet supported by the verification pipeline
}

/** Native `fetch(uri)` on content:// (Android) and sandboxed file:// (iOS)
 * document-picker URIs is unreliable — it silently throws or returns empty
 * bytes. Reading through expo-file-system as base64 is the proven fix used
 * elsewhere in this codebase (see chatDocumentPick.util.ts). */
async function ensureBase64(asset: {
  uri: string;
  base64?: string | null;
}): Promise<string | undefined> {
  if (asset.base64) return asset.base64;
  if (Platform.OS === 'web') return undefined;
  return FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function processAsset(
  orgId: string,
  docType: OrganizationKycDocType,
  asset: { uri: string; mimeType?: string | null; fileName?: string | null; base64?: string | null; fileSize?: number | null },
  addressProofType?: AddressProofType,
): Promise<PickedVerificationDocument | null> {
  const verificationDocType = resolveVerificationDocumentType(docType, addressProofType);
  if (!verificationDocType) {
    Alert.alert('Upload failed', 'This document type is not yet supported.');
    return null;
  }
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const fileName = asset.fileName ?? `${docType}-${Date.now()}.jpg`;

  let base64: string | undefined;
  try {
    base64 = await ensureBase64(asset);
  } catch (err) {
    Alert.alert(
      'Upload failed',
      err instanceof Error ? err.message : 'Could not read the selected file.',
    );
    return null;
  }

  const file: AddressProofFile = {
    uri: asset.uri,
    mimeType,
    fileName,
    base64,
  };
  const { path, error, verify } = await uploadVerificationDocument(orgId, verificationDocType, file);
  if (error || !path) {
    Alert.alert('Upload failed', error?.message ?? 'Could not upload document.');
    return null;
  }
  return {
    path,
    fileName,
    mimeType,
    sizeBytes: asset.fileSize ?? undefined,
    extractedGstin: verify?.extracted?.gstin ?? null,
    extractedPan: verify?.extracted?.pan ?? null,
  };
}

/** react-native-web's Alert.alert is a no-op (no dialog, no callbacks ever
 * fire) — see react-native-web/dist/exports/Alert/index.js. A 3-way source
 * chooser is therefore unreachable on web; go straight to the file picker,
 * which already renders the OS/browser's native file dialog. */
async function pickAndUploadVerificationDocumentWeb(
  orgId: string,
  docType: OrganizationKycDocType,
  addressProofType?: AddressProofType,
): Promise<PickedVerificationDocument | null> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return null;
    const a = res.assets[0];
    return await processAsset(
      orgId,
      docType,
      {
        uri: a.uri,
        mimeType: a.mimeType ?? 'application/pdf',
        fileName: a.name,
        fileSize: a.size,
      },
      addressProofType,
    );
  } catch (err) {
    Alert.alert('Upload failed', err instanceof Error ? err.message : 'File error.');
    return null;
  }
}

/** Document picker — camera, gallery, or PDF. `addressProofType` is required when docType === 'address_proof'. */
export function pickAndUploadVerificationDocument(
  orgId: string,
  docType: OrganizationKycDocType,
  addressProofType?: AddressProofType,
): Promise<PickedVerificationDocument | null> {
  if (Platform.OS === 'web') {
    return pickAndUploadVerificationDocumentWeb(orgId, docType, addressProofType);
  }
  return new Promise((resolve) => {
    Alert.alert('Upload document', 'Choose a source', [
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
            try {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) {
                Alert.alert('Permission required', 'Camera access is needed.');
                resolve(null);
                return;
              }
              const res = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.85,
                base64: true,
              });
              if (res.canceled || !res.assets[0]) {
                resolve(null);
                return;
              }
              resolve(await processAsset(orgId, docType, res.assets[0], addressProofType));
            } catch (err) {
              Alert.alert('Upload failed', err instanceof Error ? err.message : 'Camera error.');
              resolve(null);
            }
          })();
        },
      },
      {
        text: 'Gallery',
        onPress: () => {
          void (async () => {
            try {
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!perm.granted) {
                Alert.alert('Permission required', 'Photo library access is needed.');
                resolve(null);
                return;
              }
              const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images', 'livePhotos'],
                quality: 0.85,
                base64: true,
              });
              if (res.canceled || !res.assets[0]) {
                resolve(null);
                return;
              }
              resolve(await processAsset(orgId, docType, res.assets[0], addressProofType));
            } catch (err) {
              Alert.alert('Upload failed', err instanceof Error ? err.message : 'Gallery error.');
              resolve(null);
            }
          })();
        },
      },
      {
        text: 'PDF / File',
        onPress: () => {
          void (async () => {
            try {
              const res = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                copyToCacheDirectory: true,
              });
              if (res.canceled || !res.assets[0]) {
                resolve(null);
                return;
              }
              const a = res.assets[0];
              resolve(
                await processAsset(
                  orgId,
                  docType,
                  {
                    uri: a.uri,
                    mimeType: a.mimeType ?? 'application/pdf',
                    fileName: a.name,
                    fileSize: a.size,
                  },
                  addressProofType,
                ),
              );
            } catch (err) {
              Alert.alert('Upload failed', err instanceof Error ? err.message : 'File error.');
              resolve(null);
            }
          })();
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

/** @deprecated Use pickAndUploadVerificationDocument(orgId, 'address_proof') */
export function pickAndUploadAddressProof(orgId: string) {
  return pickAndUploadVerificationDocument(orgId, 'address_proof');
}
