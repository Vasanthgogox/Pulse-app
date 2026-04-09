import { Alert, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import Typography from '@/constants/Typography';
import { useDriverThemeColors } from '@/contexts/DriverThemeContext';

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useDriverThemeColors();

  const goToProfile = () => router.replace('/(driver)/profile');

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
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, paddingBottom: Layout.driverHeaderBottomPadding, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
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

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ID & proof</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
  docRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docRowLabel: { fontSize: 14, fontWeight: '700', color: Theme.textPrimary },
  docRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  docRowStatus: { fontSize: 12, fontWeight: '600', color: Theme.textMuted },
});
