import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import {
  uploadVerificationDocument,
  type AddressProofFile,
} from '@/features/organization/services/businessVerification.service';
import type { OrganizationKycDocType } from '@/features/organization/types/organizationKycDocuments.types';

export type PickedVerificationDocument = {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
};

async function processAsset(
  orgId: string,
  docType: OrganizationKycDocType,
  asset: { uri: string; mimeType?: string | null; fileName?: string | null; base64?: string | null; fileSize?: number | null },
): Promise<PickedVerificationDocument | null> {
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const fileName = asset.fileName ?? `${docType}-${Date.now()}.jpg`;
  const file: AddressProofFile = {
    uri: asset.uri,
    mimeType,
    fileName,
    base64: asset.base64 ?? undefined,
  };
  const { path, error } = await uploadVerificationDocument(orgId, docType, file);
  if (error || !path) {
    Alert.alert('Upload failed', error?.message ?? 'Could not upload document.');
    return null;
  }
  return {
    path,
    fileName,
    mimeType,
    sizeBytes: asset.fileSize ?? undefined,
  };
}

/** Document picker — camera, gallery, or PDF. */
export function pickAndUploadVerificationDocument(
  orgId: string,
  docType: OrganizationKycDocType,
): Promise<PickedVerificationDocument | null> {
  return new Promise((resolve) => {
    Alert.alert('Upload document', 'Choose a source', [
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
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
            resolve(await processAsset(orgId, docType, res.assets[0]));
          })();
        },
      },
      {
        text: 'Gallery',
        onPress: () => {
          void (async () => {
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
            resolve(await processAsset(orgId, docType, res.assets[0]));
          })();
        },
      },
      {
        text: 'PDF / File',
        onPress: () => {
          void (async () => {
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
              await processAsset(orgId, docType, {
                uri: a.uri,
                mimeType: a.mimeType ?? 'application/pdf',
                fileName: a.name,
                fileSize: a.size,
              }),
            );
          })();
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/** @deprecated Use pickAndUploadVerificationDocument(orgId, 'address_proof') */
export function pickAndUploadAddressProof(orgId: string) {
  return pickAndUploadVerificationDocument(orgId, 'address_proof');
}
