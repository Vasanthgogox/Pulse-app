import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import {
  getInvoiceBrandingSettings,
  updateInvoiceBrandingSettings,
} from '@/features/invoicing/services/invoiceBranding.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function sanitizeInputName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export default function BrandingSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { error, settings } = await getInvoiceBrandingSettings();
      if (!mounted) return;
      setCompanyName(settings.companyName);
      setLogoUrl(settings.logoUrl ?? '');
      setLoadWarning(error ? `Loaded fallback values (${error.message})` : null);
      setIsLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const normalizedCompanyName = useMemo(
    () => sanitizeInputName(companyName),
    [companyName],
  );
  const isCompanyNameValid = normalizedCompanyName.length > 0;
  const previewCompanyName = isCompanyNameValid ? normalizedCompanyName : 'GOGOX';

  const handleSave = async () => {
    if (!isCompanyNameValid) {
      Alert.alert('Invalid company name', 'Company display name cannot be empty.');
      return;
    }

    setIsSaving(true);
    const { error, settings } = await updateInvoiceBrandingSettings({
      companyName: normalizedCompanyName,
      logoUrl: logoUrl.trim() || null,
    });
    setIsSaving(false);

    setCompanyName(settings.companyName);
    setLogoUrl(settings.logoUrl ?? '');

    if (error) {
      Alert.alert(
        'Saved with warning',
        `Saved locally, but remote sync returned an error: ${error.message}`,
      );
      return;
    }
    Alert.alert('Updated', 'Invoice branding has been updated.');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="arrow-left" size={18} color={Theme.textPrimaryDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Branding & Identity</Text>
          <Text style={styles.subtitle}>
            Customize the watermark and logo for your invoices.
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={Theme.primary} />
          <Text style={styles.loadingText}>Loading branding settings...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Layout.sectionSpacing },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.label}>Company Display Name (Watermark)</Text>
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="e.g. GOGOX"
              placeholderTextColor={Theme.textMuted}
              maxLength={48}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>
              Company Logo URL (Optional)
            </Text>
            <TextInput
              style={styles.input}
              value={logoUrl}
              onChangeText={setLogoUrl}
              placeholder="https://example.com/logo.png"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.infoBox}>
              <FontAwesome name="info-circle" size={14} color={Theme.textMuted} />
              <Text style={styles.infoText}>
                This name appears as the diagonal watermark and in the invoice header.
                Logo URL supports http/https images and falls back to text if unavailable.
              </Text>
            </View>
            {loadWarning ? <Text style={styles.warningText}>{loadWarning}</Text> : null}
          </View>

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Live Preview</Text>
            <View style={styles.previewPaper}>
              <Text style={styles.previewWatermark}>{previewCompanyName}</Text>
              <Text style={styles.previewHeader}>{previewCompanyName}</Text>
              <Text style={styles.previewSub}>Commercial Invoice</Text>
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, (isSaving || !isCompanyNameValid) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSaving || !isCompanyNameValid}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
            ) : (
              <>
                <FontAwesome
                  name="save"
                  size={14}
                  color={Theme.buttonPrimaryText}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.saveBtnText}>Update</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.screenBackground },
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
  title: { fontSize: 16, fontWeight: '800', color: Theme.textPrimaryDark },
  subtitle: { fontSize: 12, color: Theme.textSecondary, marginTop: 2 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: Theme.textMuted },
  content: { padding: Layout.screenPaddingHorizontal, gap: 16 },
  card: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  infoBox: {
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 11, color: Theme.textSecondary, lineHeight: 16 },
  warningText: { marginTop: 8, fontSize: 11, color: Theme.warning },
  previewCard: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
  },
  previewTitle: { fontSize: 12, fontWeight: '800', color: Theme.textPrimaryDark, marginBottom: 8 },
  previewPaper: {
    height: 150,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  previewWatermark: {
    position: 'absolute',
    transform: [{ rotate: '-35deg' }],
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(15,23,42,0.08)',
    textTransform: 'uppercase',
  },
  previewHeader: {
    fontSize: 20,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  previewSub: { fontSize: 11, color: Theme.textMuted, marginTop: 4 },
  saveBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
