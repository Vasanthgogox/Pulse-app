import { Alert, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';

type DocItem = {
  key: string;
  label: string;
  icon: keyof typeof FontAwesome.glyphMap;
  status: 'not_added' | 'added';
  onPressTitle: string;
};

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/profile');
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
        <Text style={[styles.sectionEyebrow, { color: colors.textMuted }]}>ID & proof</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.docRow, { borderTopWidth: 0 }]}
            onPress={() => Alert.alert('Aadhaar', 'Document upload will be available here.')}
            activeOpacity={0.7}
          >
            <View style={styles.docRowLeft}>
              <View style={[styles.docRowIcon, { backgroundColor: colors.emeraldMuted }]}>
                <FontAwesome name="id-card" size={14} color={colors.emerald} />
              </View>
              <Text style={[styles.docRowLabel, { color: colors.text }]}>Aadhaar</Text>
            </View>
            <View style={styles.docRowRight}>
              <Text style={[styles.docRowStatus, { color: colors.textMuted }]}>Not added</Text>
              <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.docRow, { borderTopColor: colors.border }]}
            onPress={() => Alert.alert('PAN', 'Document upload will be available here.')}
            activeOpacity={0.7}
          >
            <View style={styles.docRowLeft}>
              <View style={[styles.docRowIcon, { backgroundColor: colors.emeraldMuted }]}>
                <FontAwesome name="credit-card" size={14} color={colors.emerald} />
              </View>
              <Text style={[styles.docRowLabel, { color: colors.text }]}>PAN</Text>
            </View>
            <View style={styles.docRowRight}>
              <Text style={[styles.docRowStatus, { color: colors.textMuted }]}>Not added</Text>
              <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.docRow, { borderTopColor: colors.border }]}
            onPress={() => Alert.alert('Driving License', 'Document upload will be available here.')}
            activeOpacity={0.7}
          >
            <View style={styles.docRowLeft}>
              <View style={[styles.docRowIcon, { backgroundColor: colors.emeraldMuted }]}>
                <FontAwesome name="car" size={14} color={colors.emerald} />
              </View>
              <Text style={[styles.docRowLabel, { color: colors.text }]}>Driving license</Text>
            </View>
            <View style={styles.docRowRight}>
              <Text style={[styles.docRowStatus, { color: colors.textMuted }]}>Not added</Text>
              <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
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
