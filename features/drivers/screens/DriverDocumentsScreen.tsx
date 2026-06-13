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
import * as Linking from 'expo-linking';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';

type DocItemKey = 'aadhaar' | 'pan' | 'license';
type DocItem = {
  key: DocItemKey;
  label: string;
  icon: keyof typeof FontAwesome.glyphMap;
  status: 'not_added' | 'added';
  path: string | null;
};

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

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const [docs, setDocs] = useState<DocItem[]>([
    { key: 'aadhaar', label: 'Aadhaar', icon: 'id-card', status: 'not_added', path: null },
    { key: 'pan', label: 'PAN', icon: 'credit-card', status: 'not_added', path: null },
    { key: 'license', label: 'Driving license', icon: 'car', status: 'not_added', path: null },
  ]);
  const [uploadingDocKey, setUploadingDocKey] = useState<DocItemKey | null>(null);
  const uploadedCount = docs.filter((d) => d.status === 'added').length;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/profile');
  };

  const loadDocuments = useCallback(async () => {
    if (!profile?.uid) return;
    try {
      const {
        data: { user },
      } = await supabase().auth.getUser();
      const metadata =
        user?.user_metadata &&
        typeof user.user_metadata === 'object' &&
        user.user_metadata.driver_documents &&
        typeof user.user_metadata.driver_documents === 'object'
          ? (user.user_metadata.driver_documents as Record<string, unknown>)
          : {};

      const { data: profileRow } = await supabase()
        .from('profiles')
        .select('license_photo_url')
        .eq('id', profile.uid)
        .maybeSingle();
      const licensePath =
        (profileRow as { license_photo_url?: string | null } | null)?.license_photo_url
        ?? (typeof metadata.license === 'string' ? metadata.license : null);

      const aadhaarPath = typeof metadata.aadhaar === 'string' ? metadata.aadhaar : null;
      const panPath = typeof metadata.pan === 'string' ? metadata.pan : null;
      const { data: storageItems } = await supabase()
        .storage
        .from('driver-documents')
        .list(profile.uid, { limit: 100 });
      const byPrefix = (prefix: string) =>
        (storageItems ?? []).find((item) => (item.name ?? '').toLowerCase().startsWith(prefix))?.name ?? null;
      const aadhaarStorage = byPrefix('aadhaar-');
      const panStorage = byPrefix('pan-');
      const licenseStorage = byPrefix('license-');
      const aadhaarResolved = aadhaarPath || (aadhaarStorage ? `${profile.uid}/${aadhaarStorage}` : null);
      const panResolved = panPath || (panStorage ? `${profile.uid}/${panStorage}` : null);
      const licenseResolved = licensePath || (licenseStorage ? `${profile.uid}/${licenseStorage}` : null);

      setDocs([
        {
          key: 'aadhaar',
          label: 'Aadhaar',
          icon: 'id-card',
          path: aadhaarResolved,
          status: (aadhaarResolved ?? '').trim() ? 'added' : 'not_added',
        },
        {
          key: 'pan',
          label: 'PAN',
          icon: 'credit-card',
          path: panResolved,
          status: (panResolved ?? '').trim() ? 'added' : 'not_added',
        },
        {
          key: 'license',
          label: 'Driving license',
          icon: 'car',
          path: licenseResolved,
          status: (licenseResolved ?? '').trim() ? 'added' : 'not_added',
        },
      ]);
    } catch {
      // keep default state
    }
  }, [profile?.uid]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const openDocument = async (doc: DocItem) => {
    if (!doc.path?.trim()) {
      Alert.alert(doc.label, 'Not uploaded yet. You can upload from driver sign-up or profile flow.');
      return;
    }
    try {
      if (doc.path.startsWith('http://') || doc.path.startsWith('https://')) {
        await Linking.openURL(doc.path);
        return;
      }
      const { data, error } = await supabase()
        .storage
        .from('driver-documents')
        .createSignedUrl(doc.path, 60 * 10);
      if (error || !data?.signedUrl) {
        Alert.alert('Preview unavailable', error?.message || 'Could not open document.');
        return;
      }
      await Linking.openURL(data.signedUrl);
    } catch (e) {
      Alert.alert('Preview unavailable', e instanceof Error ? e.message : 'Could not open document.');
    }
  };

  const uploadDocumentFrom = async (doc: DocItem, source: 'gallery' | 'camera') => {
    if (!profile?.uid || uploadingDocKey) return;
    setUploadingDocKey(doc.key);
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
      const path = `${profile.uid}/${doc.key}-${Date.now()}.${ext}`;
      const uploadBytes = await readAssetBytes(asset.uri, typeof asset.base64 === 'string' ? asset.base64 : undefined);

      const { error: uploadError } = await supabase()
        .storage
        .from('driver-documents')
        .upload(path, uploadBytes, {
          contentType: mimeType,
          upsert: true,
        });
      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message || `Could not upload ${doc.label}.`);
        return;
      }

      if (doc.key === 'license') {
        await supabase()
          .from('profiles')
          .update({ license_photo_url: path })
          .eq('id', profile.uid);
      }

      const {
        data: { user },
      } = await supabase().auth.getUser();
      const existingDocs =
        user?.user_metadata &&
        typeof user.user_metadata === 'object' &&
        user.user_metadata.driver_documents &&
        typeof user.user_metadata.driver_documents === 'object'
          ? (user.user_metadata.driver_documents as Record<string, unknown>)
          : {};
      const nextDocs = { ...existingDocs, [doc.key]: path };
      const { error: metadataError } = await supabase().auth.updateUser({
        data: { driver_documents: nextDocs },
      });
      if (metadataError) {
        Alert.alert('Uploaded with warning', 'File uploaded, but metadata sync failed. Refresh and try again.');
      }

      await loadDocuments();
      Alert.alert('Uploaded', `${doc.label} uploaded successfully.`);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : `Could not upload ${doc.label}.`);
    } finally {
      setUploadingDocKey(null);
    }
  };

  const onDocumentPress = (doc: DocItem) => {
    if (doc.status === 'added') {
      void openDocument(doc);
      return;
    }
    Alert.alert(doc.label, 'Upload this document now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Gallery',
        onPress: () => {
          void uploadDocumentFrom(doc, 'gallery');
        },
      },
      {
        text: 'Camera',
        onPress: () => {
          void uploadDocumentFrom(doc, 'camera');
        },
      },
    ]);
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
          {uploadedCount}/3 uploaded
        </Text>
        <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]}>ID & proof</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {docs.map((doc, idx) => (
            <TouchableOpacity
              key={doc.key}
              style={[styles.docRow, idx === 0 ? { borderTopWidth: 0 } : { borderTopColor: colors.border }]}
              onPress={() => onDocumentPress(doc)}
              activeOpacity={0.7}
              disabled={uploadingDocKey != null}
            >
              <View style={styles.docRowLeft}>
                <View style={[styles.docRowIcon, { backgroundColor: colors.emeraldMuted }]}>
                  <FontAwesome name={doc.icon} size={14} color={colors.emerald} />
                </View>
                <Text style={[styles.docRowLabel, { color: colors.text }]}>{doc.label}</Text>
              </View>
              <View style={styles.docRowRight}>
                <Text style={[styles.docRowStatus, { color: colors.textMuted }]}>
                  {uploadingDocKey === doc.key
                    ? 'Uploading...'
                    : doc.status === 'added'
                      ? 'View'
                      : 'Not added'}
                </Text>
                <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
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
  docTextWrap: {
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
  docRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  docRowStatus: { fontSize: 12, fontWeight: '600', color: Theme.textMuted },
  chevronCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
