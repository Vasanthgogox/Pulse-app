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
import { useCallback, useEffect, useState } from 'react';

type DocItemKey = 'aadhaar' | 'pan' | 'license';
type DocItem = {
  key: DocItemKey;
  label: string;
  icon: keyof typeof FontAwesome.glyphMap;
  status: 'not_added' | 'added';
  path: string | null;
};

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

      setDocs([
        {
          key: 'aadhaar',
          label: 'Aadhaar',
          icon: 'id-card',
          path: aadhaarPath,
          status: (aadhaarPath ?? '').trim() ? 'added' : 'not_added',
        },
        {
          key: 'pan',
          label: 'PAN',
          icon: 'credit-card',
          path: panPath,
          status: (panPath ?? '').trim() ? 'added' : 'not_added',
        },
        {
          key: 'license',
          label: 'Driving license',
          icon: 'car',
          path: licensePath,
          status: (licensePath ?? '').trim() ? 'added' : 'not_added',
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
              onPress={() => void openDocument(doc)}
              activeOpacity={0.7}
            >
              <View style={styles.docRowLeft}>
                <View style={[styles.docRowIcon, { backgroundColor: colors.emeraldMuted }]}>
                  <FontAwesome name={doc.icon} size={14} color={colors.emerald} />
                </View>
                <Text style={[styles.docRowLabel, { color: colors.text }]}>{doc.label}</Text>
              </View>
              <View style={styles.docRowRight}>
                <Text style={[styles.docRowStatus, { color: colors.textMuted }]}>
                  {doc.status === 'added' ? 'View' : 'Not added'}
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
