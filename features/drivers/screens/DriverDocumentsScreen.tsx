import { Alert, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import Theme from '@/constants/Theme';
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import {
  listMyDriverKycDocuments,
  submitDriverKycDocument,
  latestDriverKycDocument,
  type DriverKycDocType,
  type DriverKycDocument,
} from '@/features/drivers/services/driverKycDocuments.service';
import * as Linking from 'expo-linking';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';

const DOC_DEFS: { key: DriverKycDocType; label: string; icon: keyof typeof FontAwesome.glyphMap }[] = [
  { key: 'license', label: 'Driving license', icon: 'car' },
  { key: 'aadhaar', label: 'Aadhaar', icon: 'id-card' },
  { key: 'pan', label: 'PAN', icon: 'credit-card' },
  { key: 'selfie', label: 'Selfie', icon: 'user-circle' },
];

function normalizeDocMimeType(rawMime: string | null | undefined): string {
  const mime = (rawMime ?? '').toLowerCase();
  if (mime.includes('png')) return 'image/png';
  if (mime.includes('webp')) return 'image/webp';
  if (mime.includes('pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const maybeBuffer = (globalThis as { Buffer?: { from: (value: string, enc: string) => Uint8Array } }).Buffer;
  if (maybeBuffer?.from) return maybeBuffer.from(normalized, 'base64');
  throw new Error('Base64 decoding is not available on this device');
}

async function readAssetBytes(uri: string, base64?: string): Promise<ArrayBuffer | Uint8Array> {
  if (typeof base64 === 'string' && base64.trim().length > 0) {
    return base64ToUint8Array(base64.trim());
  }

  // Web picker commonly returns blob: URLs; fetch() reads these reliably.
  try {
    const response = await fetch(uri);
    if (response.ok) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 0) return bytes;
    }
  } catch {
    // fall through to expo-file-system
  }

  const bytes = await new File(uri).arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('Could not read selected document');
  return bytes;
}

function statusLabel(doc: DriverKycDocument | undefined): string {
  if (!doc?.storage_path) return 'Not added';
  switch (doc.status) {
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected — tap to re-upload';
    case 'expired':
      return 'Expired — tap to re-upload';
    default:
      return 'Pending review';
  }
}

function statusColor(doc: DriverKycDocument | undefined, colors: { emerald: string; textMuted: string }): string {
  if (!doc?.storage_path) return colors.textMuted;
  if (doc.status === 'verified') return colors.emerald;
  if (doc.status === 'rejected' || doc.status === 'expired') return Theme.negative;
  return Theme.accentGold;
}

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const [documents, setDocuments] = useState<DriverKycDocument[]>([]);
  const [uploadingDocKey, setUploadingDocKey] = useState<DriverKycDocType | null>(null);

  const docsByType = useMemo(() => {
    const map = new Map<DriverKycDocType, DriverKycDocument>();
    for (const def of DOC_DEFS) {
      const latest = latestDriverKycDocument(documents, def.key);
      if (latest) map.set(def.key, latest);
    }
    return map;
  }, [documents]);
  const uploadedCount = DOC_DEFS.filter((d) => docsByType.get(d.key)?.storage_path).length;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/profile');
  };

  const loadDocuments = useCallback(async () => {
    const { documents: docs } = await listMyDriverKycDocuments();
    setDocuments(docs);
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  // Realtime: admin approves/rejects → driver sees it immediately, no polling.
  // Shared channel keyed per-driver so re-mounting this screen doesn't open a
  // second subscription for the same user (registry dedupes by key).
  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscribeSharedPostgresChanges(
      `driver-kyc-docs:${profile.uid}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'driver_kyc_documents',
          filter: `driver_user_id=eq.${profile.uid}`,
        },
      ],
      () => {
        void loadDocuments();
      },
    );
    return unsubscribe;
  }, [profile?.uid, loadDocuments]);

  const openDocument = async (doc: DriverKycDocument | undefined) => {
    if (!doc?.storage_path?.trim()) return;
    try {
      const { data, error } = await supabase()
        .storage
        .from('driver-documents')
        .createSignedUrl(doc.storage_path, 60 * 10);
      if (error || !data?.signedUrl) {
        Alert.alert('Preview unavailable', error?.message || 'Could not open document.');
        return;
      }
      await Linking.openURL(data.signedUrl);
    } catch (e) {
      Alert.alert('Preview unavailable', e instanceof Error ? e.message : 'Could not open document.');
    }
  };

  const uploadDocumentFrom = async (
    docType: DriverKycDocType,
    label: string,
    source: 'gallery' | 'camera',
  ) => {
    if (!profile?.uid || uploadingDocKey) return;
    setUploadingDocKey(docType);
    try {
      if (source === 'gallery') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission required', 'Photo library access is needed to upload this document.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission required', 'Camera access is needed to capture this document.');
          return;
        }
      }

      const result =
        source === 'gallery'
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.9,
              base64: true,
            })
          : await ImagePicker.launchCameraAsync({
              allowsEditing: false,
              quality: 0.9,
              base64: true,
            });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const mimeType = normalizeDocMimeType(asset.mimeType);
      const extByMime =
        mimeType === 'image/png'
          ? 'png'
          : mimeType === 'image/webp'
            ? 'webp'
            : mimeType === 'application/pdf'
              ? 'pdf'
              : 'jpg';
      const ext = (asset.fileName?.split('.').pop() || extByMime).toLowerCase();
      const path = `${profile.uid}/${docType}-${Date.now()}.${ext}`;
      const uploadBytes = await readAssetBytes(asset.uri, typeof asset.base64 === 'string' ? asset.base64 : undefined);

      const { error: uploadError } = await supabase()
        .storage
        .from('driver-documents')
        .upload(path, uploadBytes, {
          contentType: mimeType,
          upsert: true,
        });
      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message || `Could not upload ${label}.`);
        return;
      }

      const { error: submitError } = await submitDriverKycDocument({
        doc_type: docType,
        storage_path: path,
        file_name: asset.fileName ?? `${docType}.${ext}`,
        mime_type: mimeType,
        file_size_bytes: asset.fileSize ?? undefined,
      });
      if (submitError) {
        Alert.alert('Uploaded with warning', `File uploaded, but status sync failed: ${submitError.message}`);
      }

      await loadDocuments();
      Alert.alert('Submitted', `${label} submitted for review.`);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : `Could not upload ${label}.`);
    } finally {
      setUploadingDocKey(null);
    }
  };

  const onDocumentPress = (docType: DriverKycDocType, label: string) => {
    const doc = docsByType.get(docType);
    const canReupload = !doc?.storage_path || doc.status === 'rejected' || doc.status === 'expired';

    if (doc?.storage_path && !canReupload) {
      // Verified or pending — view only. Pending review shouldn't be silently
      // overwritten while an admin may already be looking at it.
      void openDocument(doc);
      return;
    }

    const actions: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Gallery', onPress: () => void uploadDocumentFrom(docType, label, 'gallery') },
      { text: 'Camera', onPress: () => void uploadDocumentFrom(docType, label, 'camera') },
    ];
    if (doc?.storage_path) {
      actions.splice(1, 0, { text: 'View current', onPress: () => void openDocument(doc) });
    }
    Alert.alert(
      label,
      doc?.status === 'rejected' && doc.rejection_notes
        ? `Rejected: ${doc.rejection_notes}\n\nUpload a new one?`
        : 'Upload this document now?',
      actions,
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader title="KYC & documents" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
          paddingBottom: insets.bottom + 80,
          paddingTop: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLead, { color: colors.text }]}>Verification upgrade</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          Upload and verify your proof of identity. One place for all driver compliance.
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          {uploadedCount}/{DOC_DEFS.length} uploaded
        </Text>
        <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]}>ID & proof</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {DOC_DEFS.map((def, idx) => {
            const doc = docsByType.get(def.key);
            return (
              <TouchableOpacity
                key={def.key}
                style={[styles.docRow, idx === 0 ? { borderTopWidth: 0 } : { borderTopColor: colors.border }]}
                onPress={() => onDocumentPress(def.key, def.label)}
                activeOpacity={0.7}
                disabled={uploadingDocKey != null}
              >
                <View style={styles.docRowLeft}>
                  <View style={[styles.docRowIcon, { backgroundColor: colors.emeraldMuted }]}>
                    <FontAwesome name={def.icon} size={14} color={colors.emerald} />
                  </View>
                  <Text style={[styles.docRowLabel, { color: colors.text }]}>{def.label}</Text>
                </View>
                <View style={styles.docRowRight}>
                  <Text
                    style={[styles.docRowStatus, { color: statusColor(doc, colors) }]}
                    numberOfLines={1}
                  >
                    {uploadingDocKey === def.key ? 'Uploading...' : statusLabel(doc)}
                  </Text>
                  <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  sectionLead: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 2,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 10,
    paddingHorizontal: 2,
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  docRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  docRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docRowLabel: { fontSize: 15, fontWeight: '700', color: Theme.textPrimary },
  docRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, maxWidth: '55%' },
  docRowStatus: { fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
