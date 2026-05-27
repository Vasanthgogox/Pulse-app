import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, Text, View } from 'react-native';

/**
 * Business sign-up OTP step: mock verification is intentional in all environments.
 */
export function MockOtpNotice() {
  return (
    <View
      style={styles.shell}
      accessibilityRole="text"
      accessibilityLabel="Mock verification. No SMS is sent in development or production. Enter any six digit code."
    >
      <LinearGradient
        colors={['#eef2ff', '#faf5ff', '#fffbeb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.accentRail} />
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <View style={styles.iconOrb}>
              <FontAwesome name="flask" size={15} color={Theme.actionAccent} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Mock verification</Text>
              <Text style={styles.title}>No real OTP is sent</Text>
            </View>
          </View>

          <Text style={styles.description}>
            Development and production use the same mock flow. Enter any{' '}
            <Text style={styles.descriptionEmphasis}>6-digit code</Text> below to continue — SMS is not delivered.
          </Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <FontAwesome name="key" size={10} color={Theme.actionAccentBorder} />
              <Text style={styles.pillText}>Any 6 digits</Text>
            </View>
            <View style={styles.pill}>
              <FontAwesome name="ban" size={10} color={Theme.warning} />
              <Text style={styles.pillText}>No SMS service</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.22)',
    ...Platform.select({
      ios: {
        shadowColor: Theme.actionAccent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
      default: { boxShadow: '0 8px 28px rgba(79, 70, 229, 0.12)' },
    }),
  },
  gradient: {
    flexDirection: 'row',
    minHeight: 1,
  },
  accentRail: {
    width: 4,
    backgroundColor: Theme.actionAccent,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  body: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingLeft: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  iconOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.18)',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Theme.actionAccentBorder,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.25,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textRouteCard,
    marginBottom: 12,
  },
  descriptionEmphasis: {
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimary,
    letterSpacing: 0.15,
  },
});
