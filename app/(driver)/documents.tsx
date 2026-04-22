import { Alert, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import Typography from '@/constants/Typography';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';

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
  const colors = useDriverThemeColors();

  const goToProfile = () => router.replace('/(driver)/profile');
  const documents: DocItem[] = [
    {
      key: 'aadhaar',
      label: 'Aadhaar',
      icon: 'id-card',
      status: 'not_added',
      onPressTitle: 'Aadhaar',
    },
    {
      key: 'pan',
      label: 'PAN',
      icon: 'credit-card',
      status: 'not_added',
      onPressTitle: 'PAN',
    },
    {
      key: 'driving_license',
      label: 'Driving license',
      icon: 'car',
      status: 'not_added',
      onPressTitle: 'Driving License',
    },
  ];
  const addedCount = documents.filter((d) => d.status === 'added').length;
  const completionPercent = Math.round((addedCount / documents.length) * 100);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: 0,
          paddingHorizontal: Layout.screenPaddingHorizontal,
          paddingBottom: insets.bottom + 80,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingBottom: Layout.driverHeaderBottomPadding,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={goToProfile}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
          accessibilityLabel="Back to profile"
        >
          <FontAwesome name="chevron-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Documents</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.introIconWrap, { backgroundColor: colors.emeraldMuted }]}>
          <FontAwesome name="shield" size={16} color={colors.emerald} />
        </View>
        <View style={styles.introTextWrap}>
          <Text style={[styles.introTitle, { color: colors.text }]}>Keep your profile verified</Text>
          <Text style={[styles.introSubtitle, { color: colors.textMuted }]}>
            Add your ID proofs to speed up approvals, payouts, and partner onboarding.
          </Text>
        </View>
      </View>

      <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.progressHeaderRow}>
          <Text style={[styles.progressTitle, { color: colors.text }]}>Completion</Text>
          <Text style={[styles.progressMeta, { color: colors.textMuted }]}>
            {addedCount}/{documents.length} added
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.whiteMuted }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.emerald,
                width: `${completionPercent}%`,
              },
            ]}
          />
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ID & proof</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {documents.map((doc, index) => (
          <TouchableOpacity
            key={doc.key}
            style={[
              styles.docRow,
              {
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
              },
            ]}
            onPress={() =>
              Alert.alert(doc.onPressTitle, 'Document upload will be available here.')
            }
            activeOpacity={0.75}
          >
            <View style={styles.docRowLeft}>
              <View style={[styles.docRowIcon, { backgroundColor: colors.emeraldMuted }]}>
                <FontAwesome name={doc.icon} size={14} color={colors.emerald} />
              </View>
              <View style={styles.docTextWrap}>
                <Text style={[styles.docRowLabel, { color: colors.text }]}>{doc.label}</Text>
                <Text style={[styles.docRowHint, { color: colors.textMuted }]}>
                  Tap to add and verify
                </Text>
              </View>
            </View>
            <View style={styles.docRowRight}>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor:
                      doc.status === 'added' ? colors.emeraldMuted : colors.whiteMuted,
                    borderColor: doc.status === 'added' ? colors.emeraldBorder : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.docRowStatus,
                    {
                      color: doc.status === 'added' ? colors.emerald : colors.textMuted,
                    },
                  ]}
                >
                  {doc.status === 'added' ? 'Added' : 'Not added'}
                </Text>
              </View>
              <View style={[styles.chevronCircle, { backgroundColor: colors.whiteMuted }]}>
                <FontAwesome name="chevron-right" size={11} color={colors.textMuted} />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View
        style={[
          styles.infoCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <FontAwesome name="info-circle" size={14} color={colors.textMuted} />
        <Text style={[styles.infoText, { color: colors.textMuted }]}>
          Your data stays private and is only used for verification and compliance checks.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.driverHeaderHorizontalPadding,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    ...Typography.headerTitle,
    textAlign: 'center',
  },
  headerSpacer: { width: 44 },
  introCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 12,
  },
  introIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  introTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  introTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  introSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  progressCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  progressMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docRowLabel: { fontSize: 14, fontWeight: '700', color: Theme.textPrimary },
  docRowHint: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  docRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12 },
  statusPill: {
    minHeight: 24,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
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
